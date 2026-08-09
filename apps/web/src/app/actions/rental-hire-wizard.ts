"use server";

import { revalidateHireWorkspaceCache } from "@/lib/fleet/hire-workspace-cache";
import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea, getSessionUser } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadDriverIdentity, canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { computeContractEndDate } from "@/lib/fleet/hire-lifecycle";
import {
  sendDriverRegistrationInviteEmail,
  sendHireDriverAccessEmail,
} from "@/lib/fleet/hire-access-mail";
import { loadHireLessorDisplayName } from "@/lib/fleet/hire-lessor-display";
import {
  driverAccessTableStatus,
  hireEsignTableStatus,
  hireTableStatusToneClass,
  type HireTableStatus,
} from "@/lib/fleet/hire-contract-table-display";
import { HIRE_VEHICLE_BLOCKING_STATUSES, type ContractLengthKind, type RentCadence } from "@/lib/fleet/hire-types";
import { generateAccessToken, hashSecret } from "@/lib/esign/crypto";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";
import { validateAllEnvelopesReadyForHireBundleSend } from "@/lib/fleet/hire-signing-bundle";
import {
  hireAgreementsToEnvelopeReadyRows,
  pickPrepareEnvelopeId,
  type HireAgreementEnvelopeSource,
} from "@/lib/fleet/hire-envelope-readiness";
import { prepareHireAgreementEsignAction } from "@/app/actions/rental-hires";
import { assertDriverLinkedToCompany } from "@/app/actions/rental-driver-links";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { enrichHireAccessSnapshot, hireAccessSnapshotIsSparse, loadHireGroupAccessSnapshot } from "@/lib/fleet/hire-access-enrich";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { shouldHideHireRequestFromInbox } from "@/lib/fleet/driver-hire-nav";
import { deriveDriverHireSigningSummary, driverHireAccessLabel } from "@/lib/fleet/driver-hire-request-display";
import { parseHireAccessSnapshot, type HireAccessDisplay } from "@/lib/fleet/hire-access-display";
import { loadBundleAgreements } from "@/lib/esign/hire-signing-bundle";
import {
  hireWizardUsesCustomEndTime,
  normalizeDrivingLicence,
  resolveHireWizardEndTime,
  type HireWizardFormState,
  type HireWizardStep,
} from "@/lib/fleet/hire-wizard";
import { normalizeHireEndTime, normalizeHireTime } from "@/lib/fleet/hire-pdf-details";
import {
  assertVehicleAvailableForHire,
  releaseVehicleIfNoBlockingHire,
  syncVehicleStatusForHireGroup,
  vehicleIdsBlockedByInProgressHires,
} from "@/lib/fleet/sync-vehicle-hire-status";
import { mapHireInspectionCompletionByGroup } from "@/lib/fleet/hire-inspection-status";
import { buildSubcompanyLegalSnapshot } from "@/lib/rental/subcompany-legal-snapshot";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import {
  canStartCheckin,
  canStartCheckout,
  canTerminateHire,
  isCheckoutDue,
} from "@/lib/fleet/hire-lifecycle-attention";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireContractTableRow = {
  id: string;
  vehicle_id: string | null;
  status: string;
  wizard_step: number;
  terminated_at: string | null;
  ended_at: string | null;
  driver_access_status: string;
  driver_access_label: string;
  driver_access_tone: HireTableStatus["tone"];
  esign_label: string;
  esign_tone: HireTableStatus["tone"];
  vehicle_vrm: string | null;
  vehicle_label: string | null;
  subcompany_name: string | null;
  driver_name: string | null;
  driver_email: string | null;
  driver_licence_number: string | null;
  driver_label: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  scheduled_end_date: string | null;
  activated_at: string | null;
  rent_amount_gbp: number;
  rent_cadence: string;
  updated_at: string;
  first_envelope_id: string | null;
  prepare_envelope_id: string | null;
  agreement_count: number;
  signing_bundle_sent_at: string | null;
  can_prepare_for_signature: boolean;
  can_send_for_signature: boolean;
  can_cancel: boolean;
  can_regenerate_contracts: boolean;
  signed_agreement_count: number;
  can_view_signed_documents: boolean;
  checkout_completed: boolean;
  checkin_completed: boolean;
  lifecycle_label: string | null;
  lifecycle_tone: HireTableStatus["tone"];
  can_checkout: boolean;
  can_terminate: boolean;
  can_checkin: boolean;
  subcompany_id: string | null;
};

export type HireDraftPayload = {
  id: string;
  wizard_step: number;
  driver_access_status: string;
  driver_profile_confirmed: boolean;
  form: HireWizardFormState;
};

export type HireWizardTermOption = {
  id: string;
  title: string;
  version_label: string;
};

export type HireWizardShellData = {
  draft: HireDraftPayload | null;
  bankAccounts: { id: string; label: string }[];
  terms: HireWizardTermOption[];
};

function hireDraftPayloadFromRow(
  data: Record<string, unknown> | null,
  companyId: string,
): { ok: true; draft: HireDraftPayload } | { ok: false; error: string } {
  if (!data || data.parent_company_id !== companyId) return { ok: false, error: "Draft not found." };
  if (data.status !== "draft") return { ok: false, error: "This contract is no longer a draft." };
  return {
    ok: true,
    draft: {
      id: data.id as string,
      wizard_step: Number(data.wizard_step ?? 1),
      driver_access_status: (data.driver_access_status as string) ?? "not_requested",
      driver_profile_confirmed: Boolean(data.driver_profile_confirmed),
      form: formFromRow(data),
    },
  };
}

function revalidateHires(opts?: { groupId?: string; companyId?: string }) {
  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  revalidateHireWorkspaceCache(opts?.groupId, opts?.companyId);
}

function formFromRow(row: Record<string, unknown>): HireWizardFormState {
  const snap = (row.draft_snapshot ?? {}) as Record<string, unknown>;
  const lengths = (snap.contractLengths as { kind: ContractLengthKind; customEndDate?: string }[]) ?? [];
  const contractLengths: HireWizardFormState["contractLengths"] = {
    annual: false,
    six_months: false,
    custom: false,
  };
  let customEndDate = "";
  for (const l of lengths) {
    contractLengths[l.kind] = true;
    if (l.kind === "custom" && l.customEndDate) customEndDate = l.customEndDate;
  }
  return {
    vehicleId: (row.vehicle_id as string) ?? "",
    startDate: (row.start_date as string) ?? "",
    startTime: normalizeHireTime((row.start_time as string | null) ?? null, "09:00"),
    endTime: hireWizardUsesCustomEndTime({ contractLengths })
      ? normalizeHireEndTime((row.end_time as string | null) ?? null)
      : normalizeHireTime((row.start_time as string | null) ?? null, "09:00"),
    rentCadence: (row.rent_cadence as RentCadence) ?? "weekly",
    rentAmountGbp: row.rent_amount_gbp != null ? String(row.rent_amount_gbp) : "",
    includeDeposit: Boolean(row.include_deposit),
    depositGbp: row.deposit_gbp != null ? String(row.deposit_gbp) : "",
    defaultPaymentAccountId: (row.default_payment_account_id as string) ?? "",
    contractLengths,
    customEndDate,
    hireTermsVersionId: (row.hire_terms_version_id as string) ?? "",
    driverLicenceNumber: (row.driver_licence_number as string) ?? "",
    driverEmail: (row.driver_email as string) ?? "",
    insuranceProvidedBy:
      row.insurance_provided_by === "driver" || row.insurance_provided_by === "company"
        ? row.insurance_provided_by
        : "",
  };
}

export async function listHireContractsAction(
  search = "",
  vehicleId?: string,
): Promise<{ ok: true; rows: HireContractTableRow[]; canWrite: boolean } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const vehicleFilter = vehicleId?.trim();

  let groupsQuery = supabase
    .from("vehicle_hire_groups")
    .select(
      "id, vehicle_id, subcompany_id, status, wizard_step, driver_access_status, driver_user_id, start_date, start_time, end_time, activated_at, rent_amount_gbp, rent_cadence, driver_licence_number, driver_email, updated_at, signing_bundle_sent_at, terminated_at, ended_at, vehicles(vrm, make, model), subcompanies(name)",
    )
    .eq("parent_company_id", companyId)
    .neq("status", "cancelled");

  if (vehicleFilter) {
    groupsQuery = groupsQuery.eq("vehicle_id", vehicleFilter);
  }

  const { data, error } = await groupsQuery.order("updated_at", { ascending: false }).limit(vehicleFilter ? 100 : 200);

  if (error) return { ok: false, error: error.message };

  const groupIds = (data ?? []).map((g) => g.id as string);
  const driverIds = (data ?? []).map((g) => g.driver_user_id as string | null).filter(Boolean) as string[];
  let driverLabels = new Map<string, string>();
  try {
    if (driverIds.length) {
      driverLabels = await loadDriverLabelsMap(createSupabaseAdminClient(), driverIds);
    }
  } catch {
    /* driver names optional when admin client unavailable */
  }

  const agreementsByGroup = new Map<string, HireAgreementEnvelopeSource[]>();
  const inspectionByGroup = new Map<string, { checkoutCompleted: boolean; checkinCompleted: boolean }>();

  if (groupIds.length) {
    try {
      const admin = createSupabaseAdminClient();
      const [{ data: agreementRows }, { data: inspectionRows }] = await Promise.all([
        admin
          .from("vehicle_hire_agreements")
          .select(
            "id, hire_group_id, contract_length_kind, end_date, esign_envelope_id, status, esign_envelopes(id, status, field_layout, requires_owner_signature, owner_signed_at, esign_recipients(signed_at))",
          )
          .in("hire_group_id", groupIds),
        admin
          .from("vehicle_hire_inspections")
          .select("hire_group_id, kind, status")
          .in("hire_group_id", groupIds),
      ]);
      for (const a of agreementRows ?? []) {
        const groupId = a.hire_group_id as string;
        const list = agreementsByGroup.get(groupId) ?? [];
        list.push(a as HireAgreementEnvelopeSource);
        agreementsByGroup.set(groupId, list);
      }
      for (const [groupId, completion] of mapHireInspectionCompletionByGroup(
        (inspectionRows ?? []).map((row) => ({
          hire_group_id: row.hire_group_id as string,
          kind: row.kind as string,
          status: row.status as string,
        })),
      )) {
        inspectionByGroup.set(groupId, completion);
      }
    } catch {
      /* fall back to empty agreement lists */
    }
  }

  const term = search.trim().toLowerCase();
  const rows: HireContractTableRow[] = [];
  for (const g of data ?? []) {
    const vehicle = (g as { vehicles?: { vrm?: string; make?: string; model?: string } | null }).vehicles;
    const vrm = vehicle?.vrm ?? null;
    const vehicleLabel = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") : null;
    const nestedSubcompany = (g as { subcompanies?: { name?: string | null } | { name?: string | null }[] | null })
      .subcompanies;
    const subcompanyName = Array.isArray(nestedSubcompany)
      ? nestedSubcompany[0]?.name
      : nestedSubcompany?.name;
    const driverUserId = (g.driver_user_id as string | null) ?? null;
    const driverEmail = (g.driver_email as string | null)?.trim() || null;
    const driverLicence = (g.driver_licence_number as string | null)?.trim() || null;
    const profileLabel = driverUserId ? driverLabels.get(driverUserId) : undefined;
    const driverName =
      profileLabel && profileLabel !== "Driver" && !profileLabel.includes("@") ? profileLabel : null;
    const driverLabel = driverName ?? driverEmail ?? driverLicence;
    if (term) {
      const hay = [
        vrm,
        vehicleLabel,
        subcompanyName,
        driverName,
        driverEmail,
        driverLicence,
        g.status,
        g.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) continue;
    }
    const agreements = agreementsByGroup.get(g.id as string) ?? [];
    const scheduledEndDate =
      agreements
        .map((a) => (a.end_date as string | null | undefined) ?? null)
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null;
    const envelopeRows = hireAgreementsToEnvelopeReadyRows(agreements as HireAgreementEnvelopeSource[]);
    const firstEnvelopeId = envelopeRows[0]?.envelopeId ?? agreements.find((a) => a.esign_envelope_id)?.esign_envelope_id ?? null;
    const prepareEnvelopeId = pickPrepareEnvelopeId(envelopeRows) ?? firstEnvelopeId;
    const signedAgreementCount = envelopeRows.filter((row) => row.signed).length;
    const agreementCount = agreements.length;
    const allAgreementsSigned =
      agreementCount > 0 &&
      (envelopeRows.length
        ? envelopeRows.every((a) => a.signed)
        : agreements.every((a) => {
            const envStatus = (a as { esign_envelopes?: { status?: string } | null }).esign_envelopes?.status;
            return envStatus === "completed" || (a.status as string) === "active" || (a.status as string) === "reserved";
          }));
    const inSigningWorkflow =
      !allAgreementsSigned &&
      (((g.status as string) === "pending_signature") ||
        ((g.status as string) === "draft" && agreementCount > 0));
    const readyCheck = envelopeRows.length
      ? validateAllEnvelopesReadyForHireBundleSend(envelopeRows)
      : { ok: false as const, error: "No envelopes prepared." };
    const canPrepareForSignature = inSigningWorkflow;
    const canSendForSignature =
      (g.status as string) === "pending_signature" && readyCheck.ok && !allAgreementsSigned;
    const canRegenerateContracts = inSigningWorkflow;
    const driverAccess = driverAccessTableStatus((g.driver_access_status as string) ?? "not_requested");
    const esignStatus = hireEsignTableStatus({
      groupStatus: g.status as string,
      agreementCount,
      envelopeRows,
      signingBundleSentAt: (g.signing_bundle_sent_at as string | null) ?? null,
      allAgreementsSigned,
    });
    const inspection = inspectionByGroup.get(g.id as string) ?? {
      checkoutCompleted: false,
      checkinCompleted: false,
    };
    const status = g.status as string;
    let lifecycleLabel: string | null = null;
    let lifecycleTone: HireTableStatus["tone"] = "neutral";
    if (isCheckoutDue({ status, checkoutCompleted: inspection.checkoutCompleted })) {
      lifecycleLabel = "Awaiting checkout";
      lifecycleTone = "warning";
    } else if (
      canStartCheckin({
        status,
        checkoutCompleted: inspection.checkoutCompleted,
        checkinCompleted: inspection.checkinCompleted,
      })
    ) {
      lifecycleLabel = "Awaiting check-in";
      lifecycleTone = "warning";
    }
    rows.push({
      id: g.id as string,
      vehicle_id: (g.vehicle_id as string | null) ?? null,
      status: g.status as string,
      terminated_at: (g.terminated_at as string | null) ?? null,
      ended_at: (g.ended_at as string | null) ?? null,
      wizard_step: Number(g.wizard_step ?? 1),
      driver_access_status: (g.driver_access_status as string) ?? "not_requested",
      driver_access_label: driverAccess.label,
      driver_access_tone: driverAccess.tone,
      esign_label: esignStatus.label,
      esign_tone: esignStatus.tone,
      vehicle_vrm: vrm,
      vehicle_label: vehicleLabel,
      subcompany_name: subcompanyName?.trim() || null,
      driver_name: driverName,
      driver_email: driverEmail,
      driver_licence_number: driverLicence,
      driver_label: driverLabel,
      start_date: (g.start_date as string | null) ?? null,
      start_time: (g.start_time as string | null) ?? null,
      end_time: (g.end_time as string | null) ?? null,
      scheduled_end_date: scheduledEndDate,
      activated_at: (g.activated_at as string | null) ?? null,
      rent_amount_gbp: Number(g.rent_amount_gbp ?? 0),
      rent_cadence: (g.rent_cadence as string) ?? "weekly",
      updated_at: g.updated_at as string,
      first_envelope_id: firstEnvelopeId,
      prepare_envelope_id: prepareEnvelopeId,
      agreement_count: agreementCount,
      signing_bundle_sent_at: (g.signing_bundle_sent_at as string | null) ?? null,
      can_prepare_for_signature: canPrepareForSignature,
      can_send_for_signature: canSendForSignature,
      can_cancel: ["draft", "pending_signature", "reserved"].includes(g.status as string),
      can_regenerate_contracts: canRegenerateContracts,
      signed_agreement_count: signedAgreementCount,
      can_view_signed_documents: signedAgreementCount > 0,
      checkout_completed: inspection.checkoutCompleted,
      checkin_completed: inspection.checkinCompleted,
      lifecycle_label: lifecycleLabel,
      lifecycle_tone: lifecycleTone,
      can_checkout: canStartCheckout({
        status,
        checkoutCompleted: inspection.checkoutCompleted,
      }),
      can_terminate: canTerminateHire(status),
      can_checkin: canStartCheckin({
        status,
        checkoutCompleted: inspection.checkoutCompleted,
        checkinCompleted: inspection.checkinCompleted,
      }),
      subcompany_id: (g.subcompany_id as string | null) ?? null,
    });
  }

  return { ok: true, rows, canWrite: canWriteRentals(profile) };
}

export async function createHireDraftAction(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .insert({
      parent_company_id: profile.company_id,
      status: "draft",
      wizard_step: 1,
      rent_amount_gbp: 0,
      rent_cadence: "weekly",
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  try {
    const admin = createSupabaseAdminClient();
    await logHireGroupEvent(admin, {
      hireGroupId: data.id as string,
      eventType: "draft_created",
      summary: "Hire contract draft created.",
      actorRole: "company_staff",
      actorUserId: user.id,
    });
  } catch {
    /* audit optional */
  }

  revalidateHires({ groupId: data.id as string, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true, id: data.id as string };
}

export async function loadHireDraftAction(
  hireGroupId: string,
): Promise<{ ok: true; draft: HireDraftPayload } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, wizard_step, driver_access_status, driver_profile_confirmed, vehicle_id, start_date, start_time, end_time, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, default_payment_account_id, hire_terms_version_id, driver_licence_number, driver_email, insurance_provided_by, draft_snapshot, status",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return hireDraftPayloadFromRow(data as Record<string, unknown> | null, companyId);
}

/** One round-trip for wizard open: draft (optional), payment accounts, and term list (no bodies). */
export async function loadHireWizardShellAction(
  hireGroupId?: string,
): Promise<{ ok: true; data: HireWizardShellData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const draftId = hireGroupId?.trim() || null;

  const [draftRes, accountsRes, termsRes] = await Promise.all([
    draftId
      ? supabase
          .from("vehicle_hire_groups")
          .select(
            "id, parent_company_id, wizard_step, driver_access_status, driver_profile_confirmed, vehicle_id, start_date, start_time, end_time, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, default_payment_account_id, hire_terms_version_id, driver_licence_number, driver_email, insurance_provided_by, draft_snapshot, status",
          )
          .eq("id", draftId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("company_payment_accounts")
      .select("id, name, show_to_hirer, is_active, sort_order")
      .eq("parent_company_id", companyId)
      .eq("is_active", true)
      .eq("show_to_hirer", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("company_hire_terms_versions")
      .select("id, title, version_label")
      .eq("parent_company_id", companyId)
      .eq("status", "published")
      .order("published_at", { ascending: false }),
  ]);

  if (draftRes.error) return { ok: false, error: draftRes.error.message };
  if (accountsRes.error) return { ok: false, error: accountsRes.error.message };
  if (termsRes.error) return { ok: false, error: termsRes.error.message };

  let draft: HireDraftPayload | null = null;
  if (draftId) {
    const parsed = hireDraftPayloadFromRow(draftRes.data as Record<string, unknown> | null, companyId);
    if (!parsed.ok) return parsed;
    draft = parsed.draft;
  }

  return {
    ok: true,
    data: {
      draft,
      bankAccounts: (accountsRes.data ?? []).map((row) => ({
        id: row.id as string,
        label: (row.name as string) ?? "Account",
      })),
      terms: (termsRes.data ?? []) as HireWizardTermOption[],
    },
  };
}

export async function loadHireTermsBodyForWizardAction(
  termsVersionId: string,
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_hire_terms_versions")
    .select("body")
    .eq("id", termsVersionId.trim())
    .eq("parent_company_id", companyId)
    .eq("status", "published")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.body) return { ok: false, error: "Terms not found." };
  return { ok: true, body: data.body as string };
}

export async function saveHireDraftStepAction(input: {
  hireGroupId: string;
  step: HireWizardStep;
  form: HireWizardFormState;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, status, subcompany_id, vehicle_id, driver_access_status, wizard_step",
    )
    .eq("id", input.hireGroupId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing || existing.parent_company_id !== profile.company_id || existing.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (existing.driver_access_status === "approved") {
    return {
      ok: false,
      error:
        "Driver has approved access for this contract. Use Amend contract to change hire details, then request access again.",
    };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const previousVehicleId = (existing.vehicle_id as string | null) ?? null;
  const nextVehicleId = input.form.vehicleId.trim() || null;
  const vehicleChanged = previousVehicleId !== nextVehicleId;
  if (nextVehicleId && vehicleChanged) {
    const free = await assertVehicleAvailableForHire(admin, nextVehicleId, input.hireGroupId);
    if (!free.ok) return free;
  }

  const selectedLengths = (Object.keys(input.form.contractLengths) as ContractLengthKind[]).filter(
    (k) => input.form.contractLengths[k],
  );
  const contractLengths = selectedLengths.map((kind) => ({
    kind,
    customEndDate: kind === "custom" ? input.form.customEndDate : null,
  }));

  let subcompanyId = existing.subcompany_id as string | null;
  if (input.form.vehicleId) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id, subcompany_id, parent_company_id")
      .eq("id", input.form.vehicleId)
      .maybeSingle();
    if (!vehicle || vehicle.parent_company_id !== profile.company_id) {
      return { ok: false, error: "Vehicle not found." };
    }
    subcompanyId = vehicle.subcompany_id as string;
  }

  const rentAmount = Number.parseFloat(input.form.rentAmountGbp);
  const depositAmount = input.form.includeDeposit ? Number.parseFloat(input.form.depositGbp) : null;

  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({
      wizard_step: input.step,
      vehicle_id: input.form.vehicleId || null,
      subcompany_id: subcompanyId,
      start_date: input.form.startDate || null,
      start_time: input.form.startTime?.trim() ? normalizeHireTime(input.form.startTime, "09:00") : null,
      end_time: (() => {
        const resolved = resolveHireWizardEndTime(input.form);
        return resolved ? normalizeHireTime(resolved, "09:00") : null;
      })(),
      rent_cadence: input.form.rentCadence,
      rent_amount_gbp: Number.isFinite(rentAmount) ? rentAmount : 0,
      include_deposit: input.form.includeDeposit,
      deposit_gbp: input.form.includeDeposit && Number.isFinite(depositAmount!) ? depositAmount : null,
      default_payment_account_id: input.form.defaultPaymentAccountId || null,
      hire_terms_version_id: input.form.hireTermsVersionId || null,
      driver_licence_number: normalizeDrivingLicence(input.form.driverLicenceNumber) || null,
      driver_email: input.form.driverEmail.trim() || null,
      insurance_provided_by: input.form.insuranceProvidedBy || null,
      draft_snapshot: { contractLengths },
    })
    .eq("id", input.hireGroupId);

  if (error) return { ok: false, error: error.message };

  if (vehicleChanged) {
    if (previousVehicleId && previousVehicleId !== nextVehicleId) {
      await releaseVehicleIfNoBlockingHire(admin, previousVehicleId, input.hireGroupId);
    }
    if (nextVehicleId) {
      await syncVehicleStatusForHireGroup(admin, input.hireGroupId);
    } else if (previousVehicleId) {
      await releaseVehicleIfNoBlockingHire(admin, previousVehicleId, input.hireGroupId);
    }
  }

  await logHireGroupEvent(admin, {
    hireGroupId: input.hireGroupId,
    eventType: "draft_step_saved",
    summary: `Wizard step ${input.step} saved${nextVehicleId ? " (vehicle assigned)" : ""}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { step: input.step, vehicle_id: nextVehicleId },
  });

  revalidateHires({ groupId: input.hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true };
}

export type AvailableVehicleSearchRow = {
  id: string;
  vrm: string;
  make: string;
  model: string;
  year: string | null;
  colour: string | null;
  subcompanyName: string | null;
  subcompany_id: string;
};

function vehicleRegistrationYear(
  firstRegUk: string | null | undefined,
  firstReg: string | null | undefined,
): string | null {
  const iso = (firstRegUk ?? firstReg ?? "").trim();
  const match = /^(\d{4})/.exec(iso);
  return match?.[1] ?? null;
}

function mapAvailableVehicleRow(v: {
  id: string;
  vrm: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  first_reg_date: string | null;
  first_reg_uk_date: string | null;
  subcompany_id: string;
  subcompanies?: { name: string | null } | { name: string | null }[] | null;
}): AvailableVehicleSearchRow {
  const nested = v.subcompanies;
  const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
  return {
    id: v.id,
    vrm: v.vrm,
    make: v.make?.trim() ?? "",
    model: v.model?.trim() ?? "",
    year: vehicleRegistrationYear(v.first_reg_uk_date, v.first_reg_date),
    colour: v.colour?.trim() || null,
    subcompanyName: subName?.trim() || null,
    subcompany_id: v.subcompany_id,
  };
}

export async function searchAvailableVehiclesAction(
  query: string,
  options?: { forHireGroupId?: string },
): Promise<{ ok: true; rows: AvailableVehicleSearchRow[] } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  let reservedForDraft: string | null = null;
  const forHireGroupId = options?.forHireGroupId?.trim();
  if (forHireGroupId) {
    const { data: draft } = await supabase
      .from("vehicle_hire_groups")
      .select("vehicle_id")
      .eq("id", forHireGroupId)
      .eq("parent_company_id", companyId)
      .maybeSingle();
    reservedForDraft = (draft?.vehicle_id as string | null) ?? null;
  }

  let q = supabase
    .from("vehicles")
    .select("id, vrm, make, model, colour, first_reg_date, first_reg_uk_date, subcompany_id, status, subcompanies(name)")
    .eq("parent_company_id", companyId)
    .eq("status", "available")
    .order("vrm", { ascending: true })
    .limit(40);

  const term = query.trim();
  if (term.length >= 1) {
    const pat = `%${term}%`;
    q = q.or(`vrm.ilike.${pat},make.ilike.${pat},model.ilike.${pat}`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  let rows = (data ?? []).map((v) => mapAvailableVehicleRow(v));

  const { data: blockingHires } = await supabase
    .from("vehicle_hire_groups")
    .select("id, vehicle_id")
    .eq("parent_company_id", companyId)
    .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES]);
  const blockedVehicleIds = vehicleIdsBlockedByInProgressHires(blockingHires ?? [], forHireGroupId);
  rows = rows.filter((r) => !blockedVehicleIds.has(r.id));

  if (reservedForDraft && !rows.some((r) => r.id === reservedForDraft)) {
    const { data: reservedVehicle } = await supabase
      .from("vehicles")
      .select("id, vrm, make, model, colour, first_reg_date, first_reg_uk_date, subcompany_id, subcompanies(name)")
      .eq("id", reservedForDraft)
      .eq("parent_company_id", companyId)
      .maybeSingle();
    if (reservedVehicle) {
      rows = [mapAvailableVehicleRow(reservedVehicle), ...rows];
    }
  }

  return { ok: true, rows };
}

export async function listPublishedHireTermsForWizardAction(): Promise<
  { ok: true; rows: { id: string; title: string; version_label: string; body: string }[] } | { ok: false; error: string }
> {
  const { profile, user } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_hire_terms_versions")
    .select("id, title, version_label, body")
    .eq("parent_company_id", companyId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as { id: string; title: string; version_label: string; body: string }[] };
}

export async function requestDriverAccessForHireAction(
  hireGroupId: string,
): Promise<
  | { ok: true; driverExists: true; accessRequestId: string }
  | { ok: true; driverExists: false }
  | { ok: false; error: string }
> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group, error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, subcompany_id, status, vehicle_id, driver_licence_number, driver_email, start_date, rent_cadence, rent_amount_gbp",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (!group.subcompany_id || !group.vehicle_id) {
    return { ok: false, error: "Complete vehicle and contract steps first." };
  }

  const licence = normalizeDrivingLicence((group.driver_licence_number as string) ?? "");
  if (!licence) return { ok: false, error: "Driving licence number is required." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  // Exact normalised match only — never scan all driver PII.
  const { data: matchedDrivers, error: licenceLookupErr } = await admin
    .from("driver_profiles")
    .select("user_id, first_name, last_name, account_email")
    .eq("driving_licence_number_normalized", licence)
    .limit(2);
  if (licenceLookupErr) return { ok: false, error: licenceLookupErr.message };
  if ((matchedDrivers ?? []).length > 1) {
    return {
      ok: false,
      error: "Multiple driver profiles share this licence number. Ask support to resolve the duplicate before continuing.",
    };
  }
  const driver = matchedDrivers?.[0] ?? null;

  let hireSnapshot: Record<string, unknown>;
  try {
    hireSnapshot = await loadHireGroupAccessSnapshot(admin, hireGroupId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load hire details." };
  }
  if (hireAccessSnapshotIsSparse(hireSnapshot)) {
    return {
      ok: false,
      error: "Hire draft is missing vehicle or contract details. Complete earlier wizard steps first.",
    };
  }

  const site = getPublicSiteUrl();

  if (!driver?.user_id) {
    await supabase
      .from("vehicle_hire_groups")
      .update({
        driver_access_status: "awaiting_registration",
        driver_email: group.driver_email,
        driver_profile_confirmed: false,
      })
      .eq("id", hireGroupId);
    revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
    return { ok: true, driverExists: false };
  }

  const { data: pendingReq } = await admin
    .from("company_driver_access_requests")
    .select("id")
    .eq("hire_group_id", hireGroupId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (pendingReq) {
    return { ok: false, error: "A driver access request is already pending for this contract." };
  }

  const { data: priorReq } = await admin
    .from("company_driver_access_requests")
    .select("id, status")
    .eq("hire_group_id", hireGroupId)
    .in("status", ["rejected", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const token = generateAccessToken();
  const tokenHash = hashSecret(token);
  const requestPayload = {
    parent_company_id: group.parent_company_id,
    subcompany_id: group.subcompany_id,
    driver_user_id: driver.user_id,
    hire_group_id: hireGroupId,
    driving_licence_number: licence,
    driver_email: driver.account_email,
    hire_snapshot: hireSnapshot,
    response_token_hash: tokenHash,
    requested_by_user_id: user.id,
    status: "pending" as const,
    resolved_at: null,
    resolved_by_user_id: null,
  };

  let accessRequestId: string;
  const reopened = Boolean(priorReq);

  if (priorReq) {
    const { data: updated, error: upErr } = await admin
      .from("company_driver_access_requests")
      .update(requestPayload)
      .eq("id", priorReq.id)
      .select("id")
      .single();
    if (upErr) return { ok: false, error: upErr.message };
    accessRequestId = updated.id as string;

    await admin
      .from("company_driver_access_requests")
      .update({ status: "expired" })
      .eq("hire_group_id", hireGroupId)
      .neq("id", accessRequestId)
      .in("status", ["pending", "rejected"]);
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("company_driver_access_requests")
      .insert(requestPayload)
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    accessRequestId = inserted.id as string;
  }

  await admin
    .from("vehicle_hire_groups")
    .update({
      driver_access_status: "pending",
      driver_user_id: driver.user_id,
      driver_email: driver.account_email,
      driver_profile_confirmed: false,
    })
    .eq("id", hireGroupId);

  const vehicle = hireSnapshot.vehicles as { vrm?: string; make?: string; model?: string } | undefined;
  const driverName = [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || "Driver";
  const lessorName = await loadHireLessorDisplayName(admin, hireGroupId);
  const email = driver.account_email?.trim();
  if (email) {
    const mail = await sendHireDriverAccessEmail({
      to: email,
      driverName,
      companyName: lessorName,
      vehicleLabel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle",
      vrm: vehicle?.vrm ?? "—",
      startDate: (group.start_date as string) ?? "",
      rentLabel: `£${Number(group.rent_amount_gbp).toFixed(2)} / ${group.rent_cadence}`,
      accessUrl: `${site}/hire-access/${token}`,
    });
    if (!mail.ok) return { ok: false, error: mail.error };
  }

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "driver_access_requested",
    summary: reopened
      ? "Driver access request re-sent after rejection."
      : "Driver access request sent by email.",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { access_request_id: accessRequestId, driver_email: email, reopened },
  });

  await syncVehicleStatusForHireGroup(admin, hireGroupId);

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true, driverExists: true, accessRequestId };
}

export async function sendDriverRegistrationInviteForHireAction(
  hireGroupId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const to = email.trim();
  if (!to) return { ok: false, error: "Driver email is required." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, subcompany_id, status")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }

  const admin = createSupabaseAdminClient();
  const lessorName = await loadHireLessorDisplayName(admin, hireGroupId);
  const mail = await sendDriverRegistrationInviteEmail({
    to,
    companyName: lessorName,
    signupUrl: `${getPublicSiteUrl()}/signup?role=driver`,
  });
  if (!mail.ok) return mail;

  await supabase
    .from("vehicle_hire_groups")
    .update({ driver_email: to, driver_access_status: "awaiting_registration" })
    .eq("id", hireGroupId);

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true };
}

/** Advance wizard step only (after driver access is approved — hire terms are locked). */
export async function advanceHireWizardStepAction(
  hireGroupId: string,
  step: HireWizardStep,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, driver_access_status, wizard_step, driver_profile_confirmed")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (group.driver_access_status !== "approved") {
    return { ok: false, error: "Hire details are not locked." };
  }
  const currentStep = Number(group.wizard_step ?? 1);
  if (step < currentStep) {
    const reviewRetreat = currentStep === 6 && step === 5;
    if (!reviewRetreat) {
      return { ok: false, error: "Use Amend contract to go back and edit hire details." };
    }
  } else if (step === currentStep) {
    revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
    return { ok: true };
  }
  if (step === 6 && !group.driver_profile_confirmed) {
    return { ok: false, error: "Confirm the driver profile before continuing to e-sign." };
  }

  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({ wizard_step: step })
    .eq("id", hireGroupId);
  if (error) return { ok: false, error: error.message };

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true };
}

/** Unlock hire terms after driver access was approved so staff can edit and re-request access. */
export async function amendHireContractDraftAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, driver_access_status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (group.driver_access_status !== "approved") {
    return { ok: false, error: "Only approved contracts can be amended this way." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Server configuration error." };
  }

  await admin
    .from("company_driver_access_requests")
    .update({ status: "expired" })
    .eq("hire_group_id", hireGroupId)
    .in("status", ["pending", "approved"]);

  const { error } = await admin
    .from("vehicle_hire_groups")
    .update({
      driver_access_status: "not_requested",
      driver_profile_confirmed: false,
      wizard_step: 1,
    })
    .eq("id", hireGroupId);
  if (error) return { ok: false, error: error.message };

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "hire_contract_amended",
    summary: "Hire contract unlocked for amendment; driver access must be requested again.",
    actorRole: "company_staff",
    actorUserId: user.id,
  });

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  revalidatePath("/driver/hire-requests");
  return { ok: true };
}

export type HireDriverReviewDocument = {
  id: string;
  label: string;
  status: "on_file" | "missing";
  viewUrl: string | null;
};

export type HireDriverReviewPayload = {
  fullName: string;
  email: string | null;
  dateOfBirth: string;
  phone: string;
  address: string;
  drivingLicenceNumber: string | null;
  drivingLicenceExpiry: string | null;
  phvLicenceNumber: string | null;
  phvLicensingAuthority: string | null;
  phvLicenceExpiry: string | null;
  documents: HireDriverReviewDocument[];
};

export async function loadHireDriverProfileForReviewAction(
  hireGroupId: string,
): Promise<{ ok: true; profile: HireDriverReviewPayload } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadDriverIdentity(profile)) {
    return { ok: false, error: "You do not have permission to view driver identity details." };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, driver_user_id, driver_access_status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (group.driver_access_status !== "approved" || !group.driver_user_id) {
    return { ok: false, error: "Driver access must be approved before reviewing the profile." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Server configuration error." };
  }

  const linked = await assertDriverLinkedToCompany(admin, group.parent_company_id as string, group.driver_user_id as string);
  if (!linked.ok) return linked;

  const bundle = await loadDriverPreviewBundle(group.driver_user_id as string);
  if (!bundle) return { ok: false, error: "Driver profile not found." };

  const dp = bundle.dp;
  const address = [dp.address_line1, dp.address_line2, dp.address_town, dp.address_county, dp.address_postcode]
    .filter(Boolean)
    .join(", ");

  const documents: HireDriverReviewDocument[] = [
    {
      id: "driving_licence_front",
      label: "Driving licence (front)",
      status: dp.driving_licence_front_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.front,
    },
    {
      id: "driving_licence_back",
      label: "Driving licence (back)",
      status: dp.driving_licence_back_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.back,
    },
    {
      id: "phv_licence_card",
      label: "PHV/Taxi licence card",
      status: dp.phv_licence_card_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.phv,
    },
  ];

  return {
    ok: true,
    profile: {
      fullName: [dp.first_name, dp.last_name].filter(Boolean).join(" ").trim() || "Driver",
      email: bundle.email,
      dateOfBirth: dp.date_of_birth,
      phone: dp.phone,
      address: address || "—",
      drivingLicenceNumber: dp.driving_licence_number,
      drivingLicenceExpiry: dp.driving_licence_expiry,
      phvLicenceNumber: dp.phv_licence_number,
      phvLicensingAuthority: dp.phv_licensing_authority,
      phvLicenceExpiry: dp.phv_licence_expiry,
      documents,
    },
  };
}

export async function confirmDriverProfileForHireAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, driver_access_status")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (group.driver_access_status !== "approved") {
    return { ok: false, error: "Driver access must be approved first." };
  }

  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({ driver_profile_confirmed: true, wizard_step: 6 })
    .eq("id", hireGroupId);
  if (error) return { ok: false, error: error.message };

  try {
    const admin = createSupabaseAdminClient();
    await logHireGroupEvent(admin, {
      hireGroupId,
      eventType: "driver_profile_confirmed",
      summary: "Rental staff confirmed driver profile for this hire.",
      actorRole: "company_staff",
      actorUserId: user.id,
    });
  } catch {
    /* audit optional */
  }

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true };
}

export async function finalizeHireContractsAction(
  hireGroupId: string,
): Promise<{ ok: true; envelopeIds: string[] } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group, error: gErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, status, vehicle_id, driver_user_id, driver_profile_confirmed, driver_access_status, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, default_payment_account_id, hire_terms_version_id, draft_snapshot, subcompany_id",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!group || group.parent_company_id !== profile.company_id || group.status !== "draft") {
    return { ok: false, error: "Draft not found." };
  }
  if (!group.driver_profile_confirmed || group.driver_access_status !== "approved") {
    return { ok: false, error: "Confirm driver profile before creating contracts." };
  }
  if (!group.driver_user_id || !group.vehicle_id || !group.start_date) {
    return { ok: false, error: "Draft is incomplete." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const vehicleFree = await assertVehicleAvailableForHire(admin, group.vehicle_id as string, hireGroupId);
  if (!vehicleFree.ok) return vehicleFree;

  const snap = (group.draft_snapshot ?? {}) as { contractLengths?: { kind: ContractLengthKind; customEndDate?: string | null }[] };
  const lengths = snap.contractLengths ?? [];
  if (!lengths.length) return { ok: false, error: "No contract lengths on draft." };

  const { data: sub } = await supabase
    .from("subcompanies")
    .select(
      "name, display_name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_phone, primary_contact_email, logo_storage_path",
    )
    .eq("id", group.subcompany_id)
    .maybeSingle();

  const legalSnapshot = sub ? buildSubcompanyLegalSnapshot(sub) : {};

  const { data: perm } = await supabase
    .from("company_hire_permission_letter_versions")
    .select("title, body, version_label")
    .eq("parent_company_id", profile.company_id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!perm || !String(perm.body ?? "").trim()) {
    return { ok: false, error: "Publish a permission letter in Settings before creating contracts." };
  }
  const permissionSnapshot = {
    title: (perm.title as string) || "Permission letter",
    body: perm.body as string,
    version_label: (perm.version_label as string) || "1",
  };

  await supabase.from("vehicle_hire_agreements").delete().eq("hire_group_id", hireGroupId);

  const agreementRows: { contract_length_kind: ContractLengthKind; end_date: string }[] = [];
  for (const cl of lengths) {
    const end = computeContractEndDate(group.start_date as string, cl.kind, cl.customEndDate);
    if (!end) return { ok: false, error: `Invalid end date for ${cl.kind}.` };
    agreementRows.push({ contract_length_kind: cl.kind, end_date: end });
  }

  const { error: aErr } = await supabase.from("vehicle_hire_agreements").insert(
    agreementRows.map((a) => ({
      hire_group_id: hireGroupId,
      contract_length_kind: a.contract_length_kind,
      end_date: a.end_date,
      status: "draft",
    })),
  );
  if (aErr) return { ok: false, error: aErr.message };

  await supabase
    .from("vehicle_hire_groups")
    .update({ subcompany_legal_snapshot: legalSnapshot, permission_letter_snapshot: permissionSnapshot, wizard_step: 6 })
    .eq("id", hireGroupId);

  const { data: agreements } = await supabase
    .from("vehicle_hire_agreements")
    .select("id")
    .eq("hire_group_id", hireGroupId);

  const envelopeIds: string[] = [];
  for (const a of agreements ?? []) {
    const prep = await prepareHireAgreementEsignAction(a.id as string);
    if (!prep.ok) return { ok: false, error: prep.error };
    envelopeIds.push(prep.envelopeId);
  }

  await syncVehicleStatusForHireGroup(admin, hireGroupId);

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "contracts_finalized",
    summary: "Hire contracts created and prepared for e-signature.",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: { envelope_ids: envelopeIds },
  });

  revalidateHires({ groupId: hireGroupId, companyId: profile.company_id?.trim() ?? undefined });
  return { ok: true, envelopeIds };
}
export async function respondToHireAccessRequestAction(
  requestId: string,
  approve: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("company_driver_access_requests")
    .select("id, driver_user_id, hire_group_id, parent_company_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") {
    return { ok: false, error: "Request not found." };
  }
  if (req.driver_user_id !== user.id) {
    return {
      ok: false,
      error: "Sign in with the driver account this hire request was sent to.",
    };
  }

  const now = new Date().toISOString();

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Server configuration error." };
  }

  const { error: reqErr } = await admin
    .from("company_driver_access_requests")
    .update({
      status: approve ? "approved" : "rejected",
      resolved_at: now,
      resolved_by_user_id: user.id,
    })
    .eq("id", requestId);
  if (reqErr) return { ok: false, error: reqErr.message };

  if (req.hire_group_id) {
    const { error: groupErr } = await admin
      .from("vehicle_hire_groups")
      .update({ driver_access_status: approve ? "approved" : "rejected" })
      .eq("id", req.hire_group_id);
    if (groupErr) return { ok: false, error: groupErr.message };
  }

  if (approve) {
    const { error: linkErr } = await admin.from("company_driver_links").upsert(
      {
        parent_company_id: req.parent_company_id,
        driver_user_id: user.id,
        status: "active",
        linked_at: now,
        linked_by_user_id: user.id,
      },
      { onConflict: "parent_company_id,driver_user_id" },
    );
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  if (req.hire_group_id) {
    await logHireGroupEvent(admin, {
      hireGroupId: req.hire_group_id as string,
      eventType: approve ? "driver_access_approved" : "driver_access_rejected",
      summary: approve
        ? "Driver approved profile access for this hire."
        : "Driver rejected profile access for this hire.",
      actorRole: "driver",
      actorUserId: user.id,
      metadata: { access_request_id: requestId },
    });
    await syncVehicleStatusForHireGroup(admin, req.hire_group_id as string);
  }

  revalidateHires({
    groupId: (req.hire_group_id as string | null) ?? undefined,
    companyId: (req.parent_company_id as string | null) ?? undefined,
  });
  revalidatePath("/driver/hire-requests");
  return { ok: true };
}

export async function loadHireAccessByTokenAction(
  token: string,
): Promise<
  | {
      ok: true;
      requestId: string;
      companyName: string;
      hireSummary: Record<string, unknown>;
      termsPreview: { title: string; body: string; versionLabel: string | null } | null;
      status: string;
    }
  | { ok: false; error: string }
> {
  const tokenHash = hashSecret(token.trim());
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const { data: reqRow } = await admin
    .from("company_driver_access_requests")
    .select("id, status, hire_snapshot, parent_company_id, hire_group_id")
    .eq("response_token_hash", tokenHash)
    .maybeSingle();
  if (!reqRow) return { ok: false, error: "Link invalid or expired." };

  const { hireSummary, termsPreview, companyName } = await enrichHireAccessSnapshot(
    admin,
    (reqRow.hire_snapshot ?? {}) as Record<string, unknown>,
    reqRow.hire_group_id as string | null,
    reqRow.parent_company_id as string,
  );

  return {
    ok: true,
    requestId: reqRow.id as string,
    companyName: companyName ?? "Rental company",
    hireSummary,
    termsPreview,
    status: reqRow.status as string,
  };
}

export type DriverHireRequestSummary = {
  id: string;
  hireGroupId: string | null;
  status: string;
  accessLabel: string;
  accessTone: "neutral" | "pending" | "success" | "warning" | "error";
  signingLabel: string;
  signingPhase: string;
  signingAgreementCount: number;
  signingSignedCount: number;
  canOpenSigning: boolean;
  createdAt: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  rentLabel: string | null;
};

/** Logged-in driver: compact hire request list (full details loaded in review modal). */
export async function listDriverHireRequestsAction(): Promise<
  { ok: true; rows: DriverHireRequestSummary[] } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_driver_access_requests")
    .select("id, status, created_at, hire_snapshot, hire_group_id, parent_company_id")
    .eq("driver_user_id", user.id)
    .neq("status", "expired")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { ok: false, error: error.message };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const rows: DriverHireRequestSummary[] = [];
  for (const row of data ?? []) {
    const { hireSummary, termsPreview, companyName } = await enrichHireAccessSnapshot(
      admin,
      (row.hire_snapshot ?? {}) as Record<string, unknown>,
      row.hire_group_id as string | null,
      row.parent_company_id as string,
      { includeTerms: false },
    );
    const display = parseHireAccessSnapshot(hireSummary, companyName ?? "Rental company", termsPreview);
    const access = driverHireAccessLabel(row.status as string);
    const hireGroupId = (row.hire_group_id as string | null) ?? null;

    let signing = deriveDriverHireSigningSummary({
      accessRequestStatus: row.status as string,
      signingBundleSentAt: null,
      signingBundleExpiresAt: null,
      agreementCount: 0,
      signedCount: 0,
    });

    let hireGroupStatus: string | null = null;

    if (hireGroupId && row.status === "approved") {
      const { data: group } = await admin
        .from("vehicle_hire_groups")
        .select("status, signing_bundle_sent_at, signing_bundle_expires_at")
        .eq("id", hireGroupId)
        .maybeSingle();
      if (group) {
        hireGroupStatus = (group.status as string) ?? null;
        const agreements = group.signing_bundle_sent_at
          ? await loadBundleAgreements(admin, hireGroupId)
          : [];
        const signedCount = agreements.filter((a) => a.signed).length;
        signing = deriveDriverHireSigningSummary({
          accessRequestStatus: row.status as string,
          signingBundleSentAt: (group.signing_bundle_sent_at as string | null) ?? null,
          signingBundleExpiresAt: (group.signing_bundle_expires_at as string | null) ?? null,
          agreementCount: agreements.length,
          signedCount,
        });
      }
    }

    if (
      shouldHideHireRequestFromInbox({
        signingPhase: signing.phase,
        hireGroupStatus,
        accessRequestStatus: row.status as string,
      })
    ) {
      continue;
    }

    rows.push({
      id: row.id as string,
      hireGroupId,
      status: row.status as string,
      accessLabel: access.label,
      accessTone: access.tone,
      signingLabel: signing.label,
      signingPhase: signing.phase,
      signingAgreementCount: signing.agreementCount,
      signingSignedCount: signing.signedCount,
      canOpenSigning: signing.canOpenSigning,
      createdAt: row.created_at as string,
      companyName: display.companyName,
      vehicleVrm: display.vehicleVrm,
      vehicleMakeModel: display.vehicleMakeModel,
      startDateLabel: display.startDateLabel,
      rentLabel: display.rentLabel,
    });
  }

  return { ok: true, rows };
}

/** Full hire request preview for the driver review modal. */
export async function loadDriverHireRequestDetailAction(
  requestId: string,
): Promise<
  { ok: true; status: string; display: HireAccessDisplay } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("company_driver_access_requests")
    .select("id, status, hire_snapshot, hire_group_id, parent_company_id")
    .eq("id", requestId)
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Request not found." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const { hireSummary, termsPreview, companyName } = await enrichHireAccessSnapshot(
    admin,
    (row.hire_snapshot ?? {}) as Record<string, unknown>,
    row.hire_group_id as string | null,
    row.parent_company_id as string,
    { includeTerms: true },
  );

  return {
    ok: true,
    status: row.status as string,
    display: parseHireAccessSnapshot(hireSummary, companyName ?? "Rental company", termsPreview),
  };
}

export async function respondToHireAccessByTokenAction(
  token: string,
  approve: boolean,
): Promise<{ ok: true; loginRequired: boolean; requestId?: string } | { ok: false; error: string }> {
  const loaded = await loadHireAccessByTokenAction(token);
  if (!loaded.ok) return loaded;
  if (loaded.status !== "pending") return { ok: false, error: "This request has already been answered." };

  const user = await getSessionUser();
  if (!user) {
    if (!approve) {
      let admin: ReturnType<typeof createSupabaseAdminClient>;
      try {
        admin = createSupabaseAdminClient();
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Server error." };
      }
      const now = new Date().toISOString();
      await admin
        .from("company_driver_access_requests")
        .update({ status: "rejected", resolved_at: now })
        .eq("id", loaded.requestId);
      const { data: req } = await admin
        .from("company_driver_access_requests")
        .select("hire_group_id")
        .eq("id", loaded.requestId)
        .maybeSingle();
      if (req?.hire_group_id) {
        await admin
          .from("vehicle_hire_groups")
          .update({ driver_access_status: "rejected" })
          .eq("id", req.hire_group_id);
        await logHireGroupEvent(admin, {
          hireGroupId: req.hire_group_id as string,
          eventType: "driver_access_rejected",
          summary: "Driver rejected profile access via email link (without signing in).",
          actorRole: "driver",
          metadata: { access_request_id: loaded.requestId, via: "email_token" },
        });
        await syncVehicleStatusForHireGroup(admin, req.hire_group_id as string);
      }
      return { ok: true, loginRequired: false, requestId: loaded.requestId };
    }
    return { ok: true, loginRequired: true, requestId: loaded.requestId };
  }

  const res = await respondToHireAccessRequestAction(loaded.requestId, approve);
  if (!res.ok) return res;
  return { ok: true, loginRequired: false, requestId: loaded.requestId };
}
