"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { isContractExpiringSoon } from "@/lib/fleet/hire-expiry";
import {
  computeContractEndDate,
  vehicleStatusForHireGroup,
} from "@/lib/fleet/hire-lifecycle";
import { persistHireTimesheetForGroup } from "@/lib/fleet/persist-hire-timesheet";
import {
  assertVehicleAvailableForHire,
  releaseVehicleIfNoBlockingHire,
  syncVehicleStatusForHireGroup,
} from "@/lib/fleet/sync-vehicle-hire-status";
import { logHireGroupEvent, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import { clearHireGroupSigningBundle } from "@/lib/esign/hire-signing-bundle";
import {
  HIRE_VEHICLE_BLOCKING_STATUSES,
  type ContractLengthKind,
  type HireGroupStatus,
  type RentCadence,
} from "@/lib/fleet/hire-types";
import {
  assertDriverLinkedToCompany,
  loadDriverLabelsMap,
} from "@/app/actions/rental-driver-links";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireAgreementSummary = {
  id: string;
  contract_length_kind: ContractLengthKind;
  end_date: string;
  status: string;
  signed_at: string | null;
  esign_envelope_id: string | null;
};

export type FleetHireRow = HireGroupSummary & {
  vehicle_id: string;
  vehicle_vrm: string;
  vehicle_make: string;
  vehicle_model: string;
};

export type FleetHiresPageData = {
  groups: FleetHireRow[];
  canWrite: boolean;
  notify_contract_expiry_days_before: number;
};

export type HireGroupSummary = {
  id: string;
  status: HireGroupStatus;
  start_date: string;
  rent_cadence: RentCadence;
  rent_amount_gbp: number;
  deposit_gbp: number | null;
  driver_user_id: string;
  driver_label: string;
  agreements: HireAgreementSummary[];
  expiring_soon: boolean;
  created_at: string;
};

export type VehicleRentalsPageData = {
  groups: HireGroupSummary[];
  canWrite: boolean;
  notify_contract_expiry_days_before: number;
};

function revalidateVehicleRentals(vehicleId: string) {
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}/rentals`);
  revalidatePath("/rental/hires");
}

export async function loadVehicleRentalsAction(
  vehicleId: string,
): Promise<{ ok: true; data: VehicleRentalsPageData } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission to view rentals." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const [{ data: vehicle, error: vErr }, { data: company }] = await Promise.all([
    supabase.from("vehicles").select("id, parent_company_id").eq("id", vehicleId).maybeSingle(),
    supabase.from("companies").select("notify_contract_expiry_days_before").eq("id", companyId).maybeSingle(),
  ]);
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle || vehicle.parent_company_id !== companyId) return { ok: false, error: "Vehicle not found." };

  const { data: groups, error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, driver_user_id, created_at, vehicle_hire_agreements(id, contract_length_kind, end_date, status, signed_at, esign_envelope_id)",
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });
  if (gErr) return { ok: false, error: gErr.message };

  const notifyDays =
    typeof company?.notify_contract_expiry_days_before === "number"
      ? company.notify_contract_expiry_days_before
      : 28;
  const today = new Date().toISOString().slice(0, 10);

  const summaries: HireGroupSummary[] = [];
  const driverIds = (groups ?? []).map((g) => g.driver_user_id as string);
  const driverLabels = await loadDriverLabelsMap(driverIds);

  for (const g of groups ?? []) {
    const agreements = ((g as { vehicle_hire_agreements?: HireAgreementSummary[] }).vehicle_hire_agreements ??
      []) as HireAgreementSummary[];
    const maxEnd = agreements.map((a) => a.end_date).sort().at(-1) ?? null;
    summaries.push({
      id: g.id as string,
      status: g.status as HireGroupStatus,
      start_date: g.start_date as string,
      rent_cadence: g.rent_cadence as RentCadence,
      rent_amount_gbp: Number(g.rent_amount_gbp),
      deposit_gbp: g.deposit_gbp != null ? Number(g.deposit_gbp) : null,
      driver_user_id: g.driver_user_id as string,
      driver_label: driverLabels.get(g.driver_user_id as string) ?? "Driver",
      agreements,
      expiring_soon: maxEnd ? isContractExpiringSoon(maxEnd, today, notifyDays) : false,
      created_at: g.created_at as string,
    });
  }

  return {
    ok: true,
    data: {
      groups: summaries,
      canWrite: canWriteRentals(profile),
      notify_contract_expiry_days_before: notifyDays,
    },
  };
}

export async function createHireGroupAction(input: {
  vehicleId: string;
  driverUserId: string;
  startDate: string;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  depositGbp?: number | null;
  defaultPaymentAccountId?: string | null;
  contractLengths: { kind: ContractLengthKind; customEndDate?: string | null }[];
}): Promise<{ ok: true; hireGroupId: string } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission to create hires." };
  if (!input.contractLengths.length) return { ok: false, error: "Select at least one contract length." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id, subcompany_id")
    .eq("id", input.vehicleId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const linkCheck = await assertDriverLinkedToCompany(admin, vehicle.parent_company_id as string, input.driverUserId);
  if (!linkCheck.ok) return linkCheck;

  const { data: sub } = await supabase
    .from("subcompanies")
    .select("legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode")
    .eq("id", vehicle.subcompany_id)
    .maybeSingle();

  const legalSnapshot = sub
    ? {
        legal_name: sub.legal_name,
        company_number: sub.company_number,
        address: [
          sub.registered_address_line1,
          sub.registered_address_line2,
          sub.registered_town,
          sub.registered_county,
          sub.registered_postcode,
        ]
          .filter(Boolean)
          .join(", "),
      }
    : {};

  const { data: publishedTerms } = await supabase
    .from("company_hire_terms_versions")
    .select("id")
    .eq("parent_company_id", vehicle.parent_company_id)
    .eq("status", "published")
    .maybeSingle();

  const agreementRows: { contract_length_kind: ContractLengthKind; end_date: string }[] = [];
  for (const cl of input.contractLengths) {
    const end = computeContractEndDate(input.startDate, cl.kind, cl.customEndDate);
    if (!end) return { ok: false, error: `Invalid end date for ${cl.kind} contract.` };
    agreementRows.push({ contract_length_kind: cl.kind, end_date: end });
  }

  const { data: group, error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .insert({
      vehicle_id: vehicle.id,
      parent_company_id: vehicle.parent_company_id,
      subcompany_id: vehicle.subcompany_id,
      driver_user_id: input.driverUserId,
      rent_cadence: input.rentCadence,
      rent_amount_gbp: input.rentAmountGbp,
      deposit_gbp: input.depositGbp ?? null,
      start_date: input.startDate,
      default_payment_account_id: input.defaultPaymentAccountId ?? null,
      status: "draft",
      subcompany_legal_snapshot: legalSnapshot,
      hire_terms_version_id: publishedTerms?.id ?? null,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (gErr) return { ok: false, error: gErr.message };

  const { error: aErr } = await supabase.from("vehicle_hire_agreements").insert(
    agreementRows.map((a) => ({
      hire_group_id: group.id,
      contract_length_kind: a.contract_length_kind,
      end_date: a.end_date,
      status: "draft",
    })),
  );
  if (aErr) return { ok: false, error: aErr.message };

  revalidateVehicleRentals(input.vehicleId);
  return { ok: true, hireGroupId: group.id as string };
}

export async function getActiveHireForVehicle(
  vehicleId: string,
): Promise<{ id: string; status: HireGroupStatus } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status")
    .eq("vehicle_id", vehicleId)
    .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES])
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, status: data.status as HireGroupStatus };
}

export async function terminateHireOnTransfer(
  vehicleId: string,
  _transferId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const active = await getActiveHireForVehicle(vehicleId);
  if (!active) return { ok: true };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .update({
      status: "terminated",
      terminated_at: now,
      termination_reason: reason.trim() || "Vehicle subcompany transfer",
      ended_at: now,
    })
    .eq("id", active.id);
  if (gErr) return { ok: false, error: gErr.message };

  await supabase
    .from("vehicle_hire_agreements")
    .update({ status: "terminated" })
    .eq("hire_group_id", active.id)
    .in("status", ["pending_signature", "reserved", "active"]);

  const nextVehicleStatus = vehicleStatusForHireGroup("terminated");
  if (nextVehicleStatus) {
    await supabase.from("vehicles").update({ status: nextVehicleStatus }).eq("id", vehicleId);
  }

  revalidateVehicleRentals(vehicleId);
  return { ok: true };
}

export async function generateHireTimesheetForGroup(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  return persistHireTimesheetForGroup(supabase, hireGroupId);
}

export async function loadFleetHiresAction(): Promise<
  { ok: true; data: FleetHiresPageData } | { ok: false; error: string }
> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission to view hires." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const [{ data: groups, error: gErr }, { data: company }] = await Promise.all([
    supabase
      .from("vehicle_hire_groups")
      .select(
        "id, vehicle_id, status, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, driver_user_id, created_at, vehicles(vrm, make, model), vehicle_hire_agreements(id, contract_length_kind, end_date, status, signed_at, esign_envelope_id)",
      )
      .eq("parent_company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("companies").select("notify_contract_expiry_days_before").eq("id", companyId).maybeSingle(),
  ]);
  if (gErr) return { ok: false, error: gErr.message };

  const notifyDays =
    typeof company?.notify_contract_expiry_days_before === "number"
      ? company.notify_contract_expiry_days_before
      : 28;
  const today = new Date().toISOString().slice(0, 10);
  const driverLabels = await loadDriverLabelsMap((groups ?? []).map((g) => g.driver_user_id as string));

  const rows: FleetHireRow[] = (groups ?? []).map((g) => {
    const vehicle = (g as { vehicles?: { vrm?: string; make?: string; model?: string } }).vehicles ?? {};
    const agreements = ((g as { vehicle_hire_agreements?: HireAgreementSummary[] }).vehicle_hire_agreements ??
      []) as HireAgreementSummary[];
    const maxEnd = agreements.map((a) => a.end_date).sort().at(-1) ?? null;
    return {
      id: g.id as string,
      vehicle_id: g.vehicle_id as string,
      vehicle_vrm: vehicle.vrm ?? "—",
      vehicle_make: vehicle.make ?? "",
      vehicle_model: vehicle.model ?? "",
      status: g.status as HireGroupStatus,
      start_date: g.start_date as string,
      rent_cadence: g.rent_cadence as RentCadence,
      rent_amount_gbp: Number(g.rent_amount_gbp),
      deposit_gbp: g.deposit_gbp != null ? Number(g.deposit_gbp) : null,
      driver_user_id: g.driver_user_id as string,
      driver_label: driverLabels.get(g.driver_user_id as string) ?? "Driver",
      agreements,
      expiring_soon: maxEnd ? isContractExpiringSoon(maxEnd, today, notifyDays) : false,
      created_at: g.created_at as string,
    };
  });

  return {
    ok: true,
    data: {
      groups: rows,
      canWrite: canWriteRentals(profile),
      notify_contract_expiry_days_before: notifyDays,
    },
  };
}

export async function prepareHireAgreementEsignAction(
  agreementId: string,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { prepareVehicleHireAgreementEnvelope } = await import(
    "@/lib/esign/adapters/vehicle-hire-agreement"
  );
  const res = await prepareVehicleHireAgreementEnvelope(admin, agreementId.trim(), user.id);
  if (res.ok) {
    const { data: agreement } = await admin
      .from("vehicle_hire_agreements")
      .select("hire_group_id")
      .eq("id", agreementId.trim())
      .maybeSingle();
    if (agreement?.hire_group_id) {
      await syncVehicleStatusForHireGroup(admin, agreement.hire_group_id as string);
    }
    revalidatePath("/rental/hires");
    revalidatePath("/rental/vehicles");
  }
  return res;
}

/** Create any missing e-sign envelopes and return the first agreement to open in the designer. */
export async function ensureHireGroupEnvelopesPreparedAction(
  hireGroupId: string,
): Promise<{ ok: true; firstEnvelopeId: string; envelopeIds: string[] } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Hire contract not found." };
  }
  if (group.status !== "pending_signature" && group.status !== "draft") {
    return { ok: false, error: "Only contracts being prepared for e-sign can be opened in the designer." };
  }

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("id, esign_envelope_id, contract_length_kind, end_date")
    .eq("hire_group_id", group.id);
  if (!agreements?.length) {
    return { ok: false, error: "No hire agreements found. Finish the contract wizard to create agreements first." };
  }

  const { prepareVehicleHireAgreementEnvelope } = await import(
    "@/lib/esign/adapters/vehicle-hire-agreement"
  );

  const envelopeIds: string[] = [];
  for (const a of agreements) {
    if (a.esign_envelope_id) {
      envelopeIds.push(a.esign_envelope_id as string);
      continue;
    }
    const prep = await prepareVehicleHireAgreementEnvelope(admin, a.id as string, user.id);
    if (!prep.ok) return prep;
    envelopeIds.push(prep.envelopeId);
  }

  if (group.status === "draft") {
    await admin.from("vehicle_hire_groups").update({ status: "pending_signature" }).eq("id", group.id);
  }

  await syncVehicleStatusForHireGroup(admin, group.id as string);

  const { data: refreshed } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "id, contract_length_kind, end_date, esign_envelope_id, esign_envelopes(id, status, esign_recipients(signed_at))",
    )
    .eq("hire_group_id", group.id);

  const { hireAgreementsToEnvelopeReadyRows, pickPrepareEnvelopeId } = await import(
    "@/lib/fleet/hire-envelope-readiness"
  );
  const envelopeRows = hireAgreementsToEnvelopeReadyRows(refreshed ?? []);
  const firstEnvelopeId = pickPrepareEnvelopeId(envelopeRows) ?? envelopeIds[0];
  if (!firstEnvelopeId) {
    return { ok: false, error: "Could not open the e-sign designer for this contract." };
  }

  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  return { ok: true, firstEnvelopeId, envelopeIds };
}

const CANCELLABLE_HIRE_STATUSES: HireGroupStatus[] = ["draft", "pending_signature", "reserved"];

/** Cancel an in-progress hire and release the vehicle for other bookings. */
export async function cancelHireGroupAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, vehicle_id")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Hire contract not found." };
  }
  if (!CANCELLABLE_HIRE_STATUSES.includes(group.status as HireGroupStatus)) {
    return { ok: false, error: "Only draft, pending signature, or reserved hires can be cancelled." };
  }

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("id, esign_envelope_id")
    .eq("hire_group_id", group.id);

  const envelopeIds = (agreements ?? [])
    .map((a) => a.esign_envelope_id as string | null)
    .filter(Boolean) as string[];
  if (envelopeIds.length) {
    await admin
      .from("esign_envelopes")
      .update({ status: "void" })
      .in("id", envelopeIds)
      .in("status", ["draft", "awaiting_placement", "owner_signed", "sent", "viewed"]);
  }

  const now = new Date().toISOString();
  await admin
    .from("vehicle_hire_agreements")
    .update({ status: "cancelled" })
    .eq("hire_group_id", group.id)
    .in("status", ["draft", "pending_signature", "reserved", "active"]);

  await admin
    .from("vehicle_hire_groups")
    .update({ status: "cancelled", ended_at: now })
    .eq("id", group.id);

  if (group.vehicle_id) {
    await releaseVehicleIfNoBlockingHire(admin, group.vehicle_id as string, group.id as string);
  }

  await clearHireGroupSigningBundle(admin, group.id as string);

  await logHireGroupEvent(admin, {
    hireGroupId: group.id as string,
    eventType: "hire_cancelled",
    summary: "Hire contract cancelled and vehicle released.",
    actorRole: "company_staff",
    actorUserId: user.id,
  });

  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  return { ok: true };
}

/** Void open envelopes and recreate hire agreements (discard saved layout, fresh PDFs). */
export async function regenerateHireGroupContractsAction(
  hireGroupId: string,
): Promise<{ ok: true; envelopeIds: string[] } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, vehicle_id, signing_bundle_sent_at")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Hire contract not found." };
  }
  if (group.status !== "pending_signature" && group.status !== "draft") {
    return { ok: false, error: "Only contracts awaiting signature can be regenerated." };
  }

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("id, esign_envelope_id, status, esign_envelopes(status)")
    .eq("hire_group_id", group.id);

  if (!agreements?.length) {
    return {
      ok: false,
      error: "No hire agreements found. Open the draft wizard and create contracts first.",
    };
  }

  const allSigned = agreements.every((a) => {
    const envStatus = (a as { esign_envelopes?: { status?: string } | null }).esign_envelopes?.status;
    return envStatus === "completed" || a.status === "active" || a.status === "reserved";
  });
  if (allSigned) {
    return { ok: false, error: "All agreements are already signed." };
  }

  const envelopeIds = agreements
    .map((a) => a.esign_envelope_id as string | null)
    .filter(Boolean) as string[];
  if (envelopeIds.length) {
    await admin
      .from("esign_envelopes")
      .update({ status: "void" })
      .in("id", envelopeIds)
      .in("status", ["draft", "awaiting_placement", "owner_signed", "sent", "viewed", "expired"]);
  }

  await admin
    .from("vehicle_hire_agreements")
    .update({
      status: "draft",
      esign_envelope_id: null,
      signed_at: null,
      signed_storage_path: null,
    })
    .eq("hire_group_id", group.id);

  const { prepareVehicleHireAgreementEnvelope } = await import(
    "@/lib/esign/adapters/vehicle-hire-agreement"
  );

  const newEnvelopeIds: string[] = [];
  for (const a of agreements) {
    const prep = await prepareVehicleHireAgreementEnvelope(admin, a.id as string, user.id);
    if (!prep.ok) return prep;
    newEnvelopeIds.push(prep.envelopeId);
  }

  await syncVehicleStatusForHireGroup(admin, group.id as string);
  await clearHireGroupSigningBundle(admin, group.id as string);

  if (group.status === "draft") {
    await admin.from("vehicle_hire_groups").update({ status: "pending_signature" }).eq("id", group.id);
  }

  const sentToHirer = Boolean(group.signing_bundle_sent_at);
  await logHireGroupEvent(admin, {
    hireGroupId: group.id as string,
    eventType: "hire_reprepared_for_signature",
    summary: sentToHirer
      ? "Contracts discarded and regenerated; previous signing links are no longer valid."
      : "Saved e-sign layout discarded and contracts regenerated from latest hire data.",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { envelope_ids: newEnvelopeIds, sent_to_hirer: sentToHirer },
  });

  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  return { ok: true, envelopeIds: newEnvelopeIds };
}

/** @deprecated Use regenerateHireGroupContractsAction */
export async function reprepareHireGroupForSignatureAction(
  hireGroupId: string,
): Promise<{ ok: true; envelopeIds: string[] } | { ok: false; error: string }> {
  return regenerateHireGroupContractsAction(hireGroupId);
}

/** Rebuild contract PDFs from latest hire data while still preparing e-sign (not yet sent). */
export async function refreshHireGroupPdfsAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Hire contract not found." };
  }
  if (group.status !== "pending_signature") {
    return { ok: false, error: "Only contracts being prepared for e-sign can have PDFs regenerated." };
  }

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("id, esign_envelope_id, esign_envelopes(status, owner_signed_at)")
    .eq("hire_group_id", group.id);

  const refreshableStatuses = ["draft", "awaiting_placement", "owner_signed"];
  const toRefresh = (agreements ?? []).filter((a) => {
    const env = (a as { esign_envelopes?: { status?: string; owner_signed_at?: string | null } | null })
      .esign_envelopes;
    return (
      a.esign_envelope_id &&
      env?.status &&
      refreshableStatuses.includes(env.status) &&
      !env.owner_signed_at
    );
  });
  if (!toRefresh.length) {
    return { ok: false, error: "No contracts are available to regenerate — PDFs may already have been sent or signed." };
  }

  const { refreshHireEnvelopePdf } = await import("@/lib/esign/adapters/vehicle-hire-agreement");

  for (const a of toRefresh) {
    const refreshed = await refreshHireEnvelopePdf(admin, a.esign_envelope_id as string);
    if (!refreshed.ok) return refreshed;
    await admin
      .from("esign_envelopes")
      .update({
        field_layout: refreshed.suggestedFields,
        status: "awaiting_placement",
      })
      .eq("id", a.esign_envelope_id as string);
  }

  await logHireGroupEvent(admin, {
    hireGroupId: group.id as string,
    eventType: "hire_pdfs_refreshed",
    summary: "Contract PDFs regenerated from latest hire data.",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { envelope_ids: toRefresh.map((a) => a.esign_envelope_id) },
  });

  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  return { ok: true };
}

/** Chronological audit trail for a hire contract. */
export async function loadHireGroupAuditTrailAction(
  hireGroupId: string,
): Promise<{ ok: true; events: HireGroupAuditRow[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Hire contract not found." };
  }

  const { data, error } = await supabase
    .from("vehicle_hire_group_events")
    .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
    .eq("hire_group_id", hireGroupId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    events: (data ?? []).map((row) => ({
      id: row.id as string,
      event_type: row.event_type as HireGroupAuditRow["event_type"],
      actor_user_id: row.actor_user_id as string | null,
      actor_role: row.actor_role as HireGroupAuditRow["actor_role"],
      summary: row.summary as string,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      created_at: row.created_at as string,
    })),
  };
}
