"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageFleet, canWriteRentals } from "@/lib/auth/rental-permissions";
import { loadHireCheckinCompleted } from "@/lib/fleet/hire-inspection-status";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { computeContractEndDate } from "@/lib/fleet/hire-lifecycle";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import type { ContractLengthKind, HireGroupStatus, RentCadence } from "@/lib/fleet/hire-types";
import { getActiveHireForVehicle } from "@/app/actions/rental-hires";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import {
  buildVehicleTransferDocumentOptions,
  type VehicleTransferDocumentKind,
  type VehicleTransferDocumentOption,
  vehicleTransferDocumentKey,
} from "@/lib/fleet/vehicle-transfer-document-impact";
import {
  canExecuteVehicleSubcompanyTransfer,
  vehicleTransferBlockedMessage,
  vehicleTransferHirePhase,
  type VehicleTransferHirePhase,
} from "@/lib/fleet/vehicle-transfer-readiness";
import { buildSubcompanyLegalSnapshot } from "@/lib/rental/subcompany-legal-snapshot";
import { assertDriverLinkedToCompany } from "@/app/actions/rental-driver-links";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidateVehicleWorkspaceCache } from "@/lib/fleet/vehicle-workspace-cache";

export type VehicleTransferWizardState = {
  intentId: string | null;
  vehicleId: string;
  fromSubcompanyId: string;
  toSubcompanyId: string;
  blockingHire: { id: string; status: HireGroupStatus } | null;
  hirePhase: VehicleTransferHirePhase;
  checkinCompleted: boolean;
  settlementSettled: boolean;
  canTransfer: boolean;
  blockedMessage: string | null;
  documentOptions: VehicleTransferDocumentOption[];
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function revalidateVehicleTransferPaths(vehicleId: string, parentCompanyId: string, hireGroupId?: string) {
  revalidateVehicleWorkspaceCache(vehicleId, parentCompanyId);
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}`, "layout");
  revalidatePath("/rental/vehicles");
  if (hireGroupId) {
    revalidatePath(`/rental/hires/${hireGroupId}`);
    revalidatePath(`/rental/hires/${hireGroupId}/checkin`);
    revalidatePath(`/rental/hires/${hireGroupId}/payments`);
  }
}

async function assertTransferIntentAccess(
  intentId: string,
  parentCompanyId: string,
): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      intent: {
        id: string;
        vehicle_id: string;
        parent_company_id: string;
        from_subcompany_id: string;
        to_subcompany_id: string;
        superseded_hire_group_id: string | null;
        status: string;
      };
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: intent, error } = await supabase
    .from("vehicle_subcompany_transfer_intents")
    .select(
      "id, vehicle_id, parent_company_id, from_subcompany_id, to_subcompany_id, superseded_hire_group_id, status",
    )
    .eq("id", intentId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!intent || intent.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Transfer not found." };
  }
  if (intent.status !== "in_progress") {
    return { ok: false, error: "This transfer has already been completed or cancelled." };
  }
  return { ok: true, supabase, intent };
}

async function loadHireTransferContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hireGroupId: string | null,
): Promise<{
  checkinCompleted: boolean;
  settlementSettled: boolean;
  agreements: { id: string; hire_group_id: string; contract_length_kind: string; status: string; signed_at?: string | null; signed_storage_path?: string | null; esign_envelope_id?: string | null }[];
  inspections: { id: string; hire_group_id: string; kind: "checkout" | "checkin"; status: string }[];
}> {
  if (!hireGroupId) {
    return { checkinCompleted: false, settlementSettled: true, agreements: [], inspections: [] };
  }

  const checkinCompleted = await loadHireCheckinCompleted(supabase, hireGroupId);
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("settlement_balance_direction, settlement_balance_gbp")
    .eq("id", hireGroupId)
    .maybeSingle();
  const settlement = computeHireWorkspaceSettlementBalance({
    settlementBalanceDirection: (group?.settlement_balance_direction as string | null) ?? "settled",
    settlementBalanceGbp: (group?.settlement_balance_gbp as number | null) ?? 0,
  });

  const [{ data: agreements }, { data: inspections }] = await Promise.all([
    supabase
      .from("vehicle_hire_agreements")
      .select("id, hire_group_id, contract_length_kind, status, signed_at, signed_storage_path, esign_envelope_id")
      .eq("hire_group_id", hireGroupId),
    supabase
      .from("vehicle_hire_inspections")
      .select("id, hire_group_id, kind, status")
      .eq("hire_group_id", hireGroupId),
  ]);

  return {
    checkinCompleted,
    settlementSettled: settlement?.settled === true,
    agreements: agreements ?? [],
    inspections: (inspections ?? []) as { id: string; hire_group_id: string; kind: "checkout" | "checkin"; status: string }[],
  };
}

export async function loadVehicleTransferWizardStateAction(input: {
  vehicleId: string;
  toSubcompanyId: string;
  intentId?: string | null;
}): Promise<ActionResult<VehicleTransferWizardState>> {
  const { profile } = await requireRentalCompanyArea();
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  const toSubcompanyId = input.toSubcompanyId.trim();
  if (!vehicleId || !toSubcompanyId) return { ok: false, error: "Missing vehicle or destination." };

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id, subcompany_id")
    .eq("id", vehicleId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle || vehicle.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Vehicle not found." };
  }
  if (vehicle.subcompany_id === toSubcompanyId) {
    return { ok: false, error: "Vehicle is already at that subcompany." };
  }

  const blockingHire = await getActiveHireForVehicle(vehicleId);
  const hireContext = await loadHireTransferContext(supabase, blockingHire?.id ?? null);
  const hirePhase = vehicleTransferHirePhase({
    hire: blockingHire,
    checkinCompleted: hireContext.checkinCompleted,
    settlementSettled: hireContext.settlementSettled,
  });
  const canTransfer = canExecuteVehicleSubcompanyTransfer(hirePhase);

  let intentId = input.intentId?.trim() || null;
  if (intentId) {
    const access = await assertTransferIntentAccess(intentId, parentCompanyId);
    if (!access.ok) return access;
    if (access.intent.vehicle_id !== vehicleId || access.intent.to_subcompany_id !== toSubcompanyId) {
      return { ok: false, error: "Transfer session does not match this vehicle or destination." };
    }
  }

  const documentOptions = buildVehicleTransferDocumentOptions({
    hireGroupId: blockingHire?.id ?? null,
    agreements: hireContext.agreements,
    inspections: hireContext.inspections,
  });

  return {
    ok: true,
    data: {
      intentId,
      vehicleId,
      fromSubcompanyId: vehicle.subcompany_id as string,
      toSubcompanyId,
      blockingHire,
      hirePhase,
      checkinCompleted: hireContext.checkinCompleted,
      settlementSettled: hireContext.settlementSettled,
      canTransfer,
      blockedMessage: canTransfer ? null : vehicleTransferBlockedMessage(hirePhase),
      documentOptions,
    },
  };
}

export async function cancelVehicleSubcompanyTransferIntentAction(
  intentId: string,
): Promise<ActionResult<null>> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const access = await assertTransferIntentAccess(intentId, parentCompanyId);
  if (!access.ok) return access;

  const { error } = await access.supabase
    .from("vehicle_subcompany_transfer_intents")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", access.intent.id);
  if (error) return { ok: false, error: error.message };

  revalidateVehicleTransferPaths(access.intent.vehicle_id, parentCompanyId);
  return { ok: true, data: null };
}

export async function completeVehicleSubcompanyTransferAction(input: {
  vehicleId: string;
  toSubcompanyId: string;
  selectedDocumentKeys: string[];
  notes?: string | null;
}): Promise<ActionResult<{ transferId: string; supersessionHireGroupId: string | null }>> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  const toSubcompanyId = input.toSubcompanyId.trim();
  if (!vehicleId || !toSubcompanyId) return { ok: false, error: "Missing vehicle or destination." };

  const state = await loadVehicleTransferWizardStateAction({
    vehicleId,
    toSubcompanyId,
  });
  if (!state.ok) return state;
  if (!state.data.canTransfer) {
    return { ok: false, error: state.data.blockedMessage ?? "Hire must be fully closed before transfer." };
  }

  const supersededHireGroupId = state.data.blockingHire?.id ?? null;
  if (supersededHireGroupId && !canWriteRentals(profile)) {
    return { ok: false, error: "You do not have permission to create replacement hires." };
  }

  const selected = new Set(input.selectedDocumentKeys);
  const selectedOptions = state.data.documentOptions.filter((opt) => selected.has(opt.key));
  if (!selectedOptions.length) {
    return { ok: false, error: "Select at least one document to update." };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  await supabase
    .from("vehicle_subcompany_transfer_intents")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("vehicle_id", vehicleId)
    .eq("status", "in_progress");

  const { data: intent, error: intentErr } = await supabase
    .from("vehicle_subcompany_transfer_intents")
    .insert({
      vehicle_id: vehicleId,
      parent_company_id: parentCompanyId,
      from_subcompany_id: state.data.fromSubcompanyId,
      to_subcompany_id: toSubcompanyId,
      superseded_hire_group_id: supersededHireGroupId,
      notes: input.notes?.trim() || null,
      created_by: user.id,
      status: "in_progress",
    })
    .select("id")
    .single();
  if (intentErr || !intent?.id) {
    return { ok: false, error: intentErr?.message ?? "Could not record transfer." };
  }

  const intentId = intent.id as string;

  const { data: transfer, error: tErr } = await supabase
    .from("vehicle_transfers")
    .insert({
      vehicle_id: vehicleId,
      parent_company_id: parentCompanyId,
      from_subcompany_id: state.data.fromSubcompanyId,
      to_subcompany_id: toSubcompanyId,
      transferred_by: user.id,
      notes: input.notes?.trim() || null,
      transfer_intent_id: intentId,
      superseded_hire_group_id: supersededHireGroupId,
    })
    .select("id")
    .single();
  if (tErr || !transfer?.id) return { ok: false, error: tErr?.message ?? "Transfer failed." };

  const { error: uErr } = await supabase
    .from("vehicles")
    .update({ subcompany_id: toSubcompanyId })
    .eq("id", vehicleId)
    .eq("parent_company_id", parentCompanyId);
  if (uErr) return { ok: false, error: uErr.message };

  const requirementRows = selectedOptions.map((opt) => ({
    transfer_intent_id: intentId,
    vehicle_transfer_id: transfer.id,
    parent_company_id: parentCompanyId,
    vehicle_id: vehicleId,
    document_kind: opt.documentKind as VehicleTransferDocumentKind,
    hire_group_id: opt.hireGroupId ?? null,
    agreement_id: opt.agreementId ?? null,
    inspection_id: opt.inspectionId ?? null,
    status: "required",
  }));
  const { error: reqErr } = await supabase.from("vehicle_transfer_document_requirements").insert(requirementRows);
  if (reqErr) return { ok: false, error: reqErr.message };

  let supersessionHireGroupId: string | null = null;
  if (supersededHireGroupId) {
    const draft = await createSupersessionHireDraftForTransfer({
      supersededHireGroupId,
      vehicleId,
      toSubcompanyId,
      parentCompanyId,
      userId: user.id,
      transferId: transfer.id as string,
    });
    if (!draft.ok) return draft;
    supersessionHireGroupId = draft.data.hireGroupId;

    await supabase
      .from("vehicle_transfers")
      .update({ supersession_hire_group_id: supersessionHireGroupId })
      .eq("id", transfer.id);
  }

  await supabase
    .from("vehicle_subcompany_transfer_intents")
    .update({ status: "completed", completed_at: now })
    .eq("id", intentId);

  revalidateVehicleTransferPaths(vehicleId, parentCompanyId, supersededHireGroupId ?? undefined);
  revalidatePath("/rental/hires");
  if (supersessionHireGroupId) {
    revalidatePath(`/rental/hires/${supersessionHireGroupId}`);
  }

  return {
    ok: true,
    data: { transferId: transfer.id as string, supersessionHireGroupId },
  };
}

async function createSupersessionHireDraftForTransfer(input: {
  supersededHireGroupId: string;
  vehicleId: string;
  toSubcompanyId: string;
  parentCompanyId: string;
  userId: string;
  transferId: string;
}): Promise<ActionResult<{ hireGroupId: string }>> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const supabase = await createClient();
  const { data: oldGroup, error: oldErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, driver_user_id, rent_cadence, rent_amount_gbp, deposit_gbp, default_payment_account_id, vehicle_hire_agreements(contract_length_kind, end_date, status)",
    )
    .eq("id", input.supersededHireGroupId)
    .eq("parent_company_id", input.parentCompanyId)
    .maybeSingle();
  if (oldErr) return { ok: false, error: oldErr.message };
  if (!oldGroup) return { ok: false, error: "Superseded hire not found." };

  const linkCheck = await assertDriverLinkedToCompany(
    admin,
    input.parentCompanyId,
    oldGroup.driver_user_id as string,
  );
  if (!linkCheck.ok) return linkCheck;

  const { data: sub } = await supabase
    .from("subcompanies")
    .select(
      "name, display_name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_phone, primary_contact_email, logo_storage_path",
    )
    .eq("id", input.toSubcompanyId)
    .maybeSingle();
  const legalSnapshot = sub ? buildSubcompanyLegalSnapshot(sub) : {};

  const { data: publishedTerms } = await supabase
    .from("company_hire_terms_versions")
    .select("id")
    .eq("parent_company_id", input.parentCompanyId)
    .eq("status", "published")
    .maybeSingle();

  const startDate = new Date().toISOString().slice(0, 10);
  const agreements = (oldGroup.vehicle_hire_agreements ?? []) as {
    contract_length_kind: ContractLengthKind;
    end_date: string;
    status: string;
  }[];
  const activeAgreements = agreements.filter((a) => a.status !== "cancelled" && a.status !== "superseded");
  const agreementSource = activeAgreements.length ? activeAgreements : agreements;

  const { data: group, error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .insert({
      vehicle_id: input.vehicleId,
      parent_company_id: input.parentCompanyId,
      subcompany_id: input.toSubcompanyId,
      driver_user_id: oldGroup.driver_user_id,
      rent_cadence: oldGroup.rent_cadence as RentCadence,
      rent_amount_gbp: oldGroup.rent_amount_gbp,
      deposit_gbp: oldGroup.deposit_gbp,
      start_date: startDate,
      default_payment_account_id: oldGroup.default_payment_account_id,
      status: "draft",
      supersedes_hire_group_id: input.supersededHireGroupId,
      subcompany_legal_snapshot: legalSnapshot,
      hire_terms_version_id: publishedTerms?.id ?? null,
      created_by_user_id: input.userId,
    })
    .select("id")
    .single();
  if (gErr || !group?.id) return { ok: false, error: gErr?.message ?? "Could not create replacement hire." };

  const agreementRows = agreementSource.map((a) => {
    const end = computeContractEndDate(startDate, a.contract_length_kind, a.end_date);
    return {
      hire_group_id: group.id,
      contract_length_kind: a.contract_length_kind,
      end_date: end ?? a.end_date,
      status: "draft" as const,
      supersedes_agreement_id: null,
    };
  });
  if (agreementRows.length) {
    const { error: aErr } = await supabase.from("vehicle_hire_agreements").insert(agreementRows);
    if (aErr) return { ok: false, error: aErr.message };
  }

  await supabase
    .from("vehicle_hire_groups")
    .update({ superseded_by_hire_group_id: group.id })
    .eq("id", input.supersededHireGroupId);

  const carry = await carryCheckoutFromSupersededHireInternal(admin, {
    supersededHireGroupId: input.supersededHireGroupId,
    newHireGroupId: group.id as string,
    parentCompanyId: input.parentCompanyId,
    userId: input.userId,
  });
  if (!carry.ok) return carry;

  await logHireGroupEvent(admin, {
    hireGroupId: group.id as string,
    eventType: "draft_created",
    summary: "Replacement hire draft created after subcompany vehicle transfer.",
    actorRole: "company_staff",
    actorUserId: input.userId,
    metadata: {
      supersedes_hire_group_id: input.supersededHireGroupId,
      vehicle_transfer_id: input.transferId,
    },
  });

  return { ok: true, data: { hireGroupId: group.id as string } };
}

async function carryCheckoutFromSupersededHireInternal(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    supersededHireGroupId: string;
    newHireGroupId: string;
    parentCompanyId: string;
    userId: string;
  },
): Promise<ActionResult<null>> {
  const { data: sourceCheckout } = await admin
    .from("vehicle_hire_inspections")
    .select(
      "id, odometer_reading, fuel_level, general_notes, has_spare_tyre, has_tyre_key_locks, has_tyre_inflation_kit, has_charging_cable, has_tyre_replacement_kit",
    )
    .eq("hire_group_id", input.supersededHireGroupId)
    .eq("kind", "checkout")
    .eq("status", "completed")
    .maybeSingle();
  if (!sourceCheckout?.id) return { ok: true, data: null };

  const { data: existingDraft } = await admin
    .from("vehicle_hire_inspections")
    .select("id")
    .eq("hire_group_id", input.newHireGroupId)
    .eq("kind", "checkout")
    .eq("status", "draft")
    .maybeSingle();

  const inspectionPayload = {
    hire_group_id: input.newHireGroupId,
    parent_company_id: input.parentCompanyId,
    kind: "checkout" as const,
    status: "draft" as const,
    odometer_reading: sourceCheckout.odometer_reading,
    fuel_level: sourceCheckout.fuel_level,
    general_notes: sourceCheckout.general_notes,
    has_spare_tyre: sourceCheckout.has_spare_tyre,
    has_tyre_key_locks: sourceCheckout.has_tyre_key_locks,
    has_tyre_inflation_kit: sourceCheckout.has_tyre_inflation_kit,
    has_charging_cable: sourceCheckout.has_charging_cable,
    has_tyre_replacement_kit: sourceCheckout.has_tyre_replacement_kit,
    carried_from_inspection_id: sourceCheckout.id,
    completion_mode: "physical" as const,
  };

  if (existingDraft?.id) {
    await admin.from("vehicle_hire_inspections").update(inspectionPayload).eq("id", existingDraft.id);
  } else {
    await admin.from("vehicle_hire_inspections").insert(inspectionPayload);
  }

  return { ok: true, data: null };
}

export async function completeMirroredHireCheckinForTransferAction(input: {
  vehicleId: string;
  hireGroupId: string;
  attestation: string;
}): Promise<ActionResult<null>> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const attestation = input.attestation.trim();
  if (attestation.length < 10) {
    return { ok: false, error: "Enter a short attestation that the vehicle condition is unchanged since checkout." };
  }

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  const hireGroupId = input.hireGroupId.trim();
  if (!vehicleId || !hireGroupId) return { ok: false, error: "Missing vehicle or hire." };

  const admin = createSupabaseAdminClient();
  const { data: group, error: gErr } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, parent_company_id, vehicle_id")
    .eq("id", hireGroupId)
    .eq("parent_company_id", parentCompanyId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!group) return { ok: false, error: "Hire not found." };
  if (group.vehicle_id !== vehicleId) {
    return { ok: false, error: "Hire is not for this vehicle." };
  }
  if (group.status !== "terminated") {
    return { ok: false, error: "End the contract before recording mirrored check-in." };
  }

  const checkinDone = await loadHireCheckinCompleted(admin, hireGroupId);
  if (checkinDone) return { ok: false, error: "Check-in is already completed." };

  const { data: checkout } = await admin
    .from("vehicle_hire_inspections")
    .select(
      "id, odometer_reading, fuel_level, general_notes, has_spare_tyre, has_tyre_key_locks, has_tyre_inflation_kit, has_charging_cable, has_tyre_replacement_kit",
    )
    .eq("hire_group_id", hireGroupId)
    .eq("kind", "checkout")
    .eq("status", "completed")
    .maybeSingle();
  if (!checkout?.id) {
    return { ok: false, error: "Complete checkout on this hire before mirrored check-in." };
  }

  const now = new Date().toISOString();
  const notes = `${checkout.general_notes ? `${checkout.general_notes}\n\n` : ""}Mirrored check-in (subcompany transfer): ${attestation}`;

  const { data: checkin, error: cErr } = await admin
    .from("vehicle_hire_inspections")
    .insert({
      hire_group_id: hireGroupId,
      parent_company_id: parentCompanyId,
      kind: "checkin",
      status: "completed",
      completion_mode: "mirrored",
      mirrored_from_inspection_id: checkout.id,
      transfer_intent_id: null,
      odometer_reading: checkout.odometer_reading,
      fuel_level: checkout.fuel_level,
      general_notes: notes,
      has_spare_tyre: checkout.has_spare_tyre,
      has_tyre_key_locks: checkout.has_tyre_key_locks,
      has_tyre_inflation_kit: checkout.has_tyre_inflation_kit,
      has_charging_cable: checkout.has_charging_cable,
      has_tyre_replacement_kit: checkout.has_tyre_replacement_kit,
      completed_at: now,
      completed_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (cErr || !checkin?.id) return { ok: false, error: cErr?.message ?? "Could not complete mirrored check-in." };

  const { error: hireErr } = await admin
    .from("vehicle_hire_groups")
    .update({ status: "completed", ended_at: now })
    .eq("id", hireGroupId);
  if (hireErr) return { ok: false, error: hireErr.message };

  await syncVehicleStatusForHireGroup(admin, hireGroupId);
  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "checkin_completed",
    summary: "Mirrored vehicle check-in completed for subcompany transfer (no new damage charges).",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { completion_mode: "mirrored", vehicle_id: vehicleId },
  });

  revalidateVehicleTransferPaths(vehicleId, parentCompanyId, hireGroupId);
  return { ok: true, data: null };
}

export async function carryCheckoutFromSupersededHireAction(
  newHireGroupId: string,
): Promise<ActionResult<null>> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission to manage hires." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, supersedes_hire_group_id, parent_company_id, status")
    .eq("id", newHireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group || group.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Hire not found." };
  }
  if (!group.supersedes_hire_group_id) {
    return { ok: false, error: "This hire is not a supersession replacement." };
  }

  const admin = createSupabaseAdminClient();
  return carryCheckoutFromSupersededHireInternal(admin, {
    supersededHireGroupId: group.supersedes_hire_group_id as string,
    newHireGroupId: group.id as string,
    parentCompanyId,
    userId: user.id,
  });
}

export { vehicleTransferDocumentKey };
