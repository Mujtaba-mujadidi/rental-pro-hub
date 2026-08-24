"use server";

import { revalidatePath } from "next/cache";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import { assertStaffHireSubcompanyAccess } from "@/lib/auth/rental-subcompany-access";
import { formatUkDateAtTime, formatUkDateTime, ukTodayYmd } from "@/lib/datetime/uk";
import {
  canCancelHireEndHireProcess,
  canFinalizeHireEndHireProcess,
  emptyHireEndHireDraft,
  hireEndHireReturnedAtIso,
  isHireEndHireAutoCompletedBeforeFinalisation,
  isHireEndHireFinalized,
  isHireEndHireReturnReason,
  isHireEndHireStep,
  parseHireEndHireDraft,
  type HireEndHireDraft,
  type HireEndHireReturnReason,
  type HireEndHireStep,
} from "@/lib/fleet/hire-end-hire";
import { cancelOpenSubcompanyDocumentRequirementsForHire } from "@/lib/rental/subcompany-hire-document-requirements";
import {
  buildHireEndHireFinancialReview,
  buildHireEndHirePendingApprovalItems,
  type HireEndHireFinancialReview,
  type HireEndHirePendingApprovalItem,
} from "@/lib/fleet/hire-end-hire-financial";
import { hirePaymentPendingApprovalAmountGbp } from "@/lib/fleet/hire-payment-display";
import { canStartCheckin, canTerminateHire } from "@/lib/fleet/hire-lifecycle-attention";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION } from "@/lib/fleet/hire-settlement-finalization";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import { revalidateHireWorkspaceCache } from "@/lib/fleet/hire-workspace-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadHirePaymentsPageAction, type HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  loadHireTerminationPreviewAction,
  terminateHireGroupAction,
} from "@/app/actions/rental-hire-termination";

function londonTimeHmNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

async function authorizeEndHireWrite(hireGroupId: string): Promise<
  | {
      ok: true;
      hire: {
        id: string;
        status: string;
        parentCompanyId: string;
        endHireDraft: HireEndHireDraft | null;
        checkoutCompleted: boolean;
        checkinCompleted: boolean;
        settlementBalanceGbp: number;
        terminatedAt: string | null;
      };
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, parent_company_id, subcompany_id, end_hire_draft, settlement_balance_gbp, terminated_at")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const scope = await assertStaffHireSubcompanyAccess(
    profile,
    (group.subcompany_id as string | null) ?? null,
  );
  if (!scope.ok) return scope;

  const [{ data: checkoutRow }, { data: checkinRow }] = await Promise.all([
    supabase
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", id)
      .eq("kind", "checkout")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", id)
      .eq("kind", "checkin")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle(),
  ]);
  const checkoutCompleted = Boolean(checkoutRow?.id);
  const checkinCompleted = Boolean(checkinRow?.id);

  return {
    ok: true,
    hire: {
      id: group.id as string,
      status: String(group.status ?? ""),
      parentCompanyId: group.parent_company_id as string,
      endHireDraft: parseHireEndHireDraft(group.end_hire_draft),
      checkoutCompleted,
      checkinCompleted,
      settlementBalanceGbp: Number(group.settlement_balance_gbp ?? 0),
      terminatedAt: (group.terminated_at as string | null) ?? null,
    },
  };
}

async function revalidateEndHire(hireGroupId: string, parentCompanyId?: string) {
  const id = hireGroupId.trim();
  await revalidateVehicleFinancialsForHireGroup(id);
  revalidatePath(`/rental/hires/${id}`);
  revalidatePath(`/rental/hires/${id}/end-hire`);
  revalidatePath(`/rental/hires/${id}/checkin`);
  revalidatePath(`/rental/hires/${id}/payments`);
  revalidatePath("/rental/balances");
  revalidatePath(`/rental/balances/${id}`);
  revalidateHireWorkspaceCache(id, parentCompanyId);
}

/** Undo legacy check-in auto-complete (status=completed without explicit finalise). */
export async function repairAutoCompletedEndHireOnLoadAction(
  hireGroupId: string,
): Promise<{ ok: true; repaired: boolean } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const repaired = await repairAutoCompletedEndHireIfNeeded({
    id: authorized.hire.id,
    parentCompanyId: authorized.hire.parentCompanyId,
    status: authorized.hire.status,
    endHireDraft: authorized.hire.endHireDraft,
    checkinCompleted: authorized.hire.checkinCompleted,
    terminatedAt: authorized.hire.terminatedAt,
  });
  return { ok: true, repaired };
}

/** Undo legacy check-in auto-complete (status=completed without explicit finalise). */
async function repairAutoCompletedEndHireIfNeeded(hire: {
  id: string;
  parentCompanyId: string;
  status: string;
  endHireDraft: HireEndHireDraft | null;
  checkinCompleted: boolean;
  terminatedAt?: string | null;
}): Promise<boolean> {
  if (
    !isHireEndHireAutoCompletedBeforeFinalisation({
      status: hire.status,
      draft: hire.endHireDraft,
      checkinCompleted: hire.checkinCompleted,
      terminatedAt: hire.terminatedAt,
    })
  ) {
    return false;
  }

  const nowIso = new Date().toISOString();
  const previous =
    hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());
  const draft: HireEndHireDraft = {
    ...previous,
    started: true,
    step: "final_account",
    updatedAt: nowIso,
    finalizedAt: null,
    explicitFinalization: false,
  };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vehicle_hire_groups")
    .update({
      status: "terminated",
      ended_at: null,
      end_hire_draft: draft,
    })
    .eq("id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .eq("status", "completed")
    .select("id");
  if (error || !data?.length) return false;

  await syncVehicleStatusForHireGroup(admin, hire.id);
  await revalidateEndHire(hire.id, hire.parentCompanyId);
  return true;
}

export type HireEndHirePageData = {
  hireGroupId: string;
  hireGroupIdShort: string;
  vehicleVrm: string;
  status: string;
  draft: HireEndHireDraft;
  checkinCompleted: boolean;
  canStartCheckin: boolean;
  canConfirmReturn: boolean;
  canCancelEndHire: boolean;
  canFinalizeEndHire: boolean;
  isEndHireFinalized: boolean;
  financialReview: HireEndHireFinancialReview | null;
  pendingApprovalItems: HireEndHirePendingApprovalItem[];
  pendingScheduleRows: HirePaymentPageRow[];
  extraChargePendingPayment: {
    submissionId: string;
    amountGbp: number;
    paymentReference: string | null;
  } | null;
  extraChargesOutstandingGbp: number;
  canApprovePayments: boolean;
  openBalanceGbp: number;
  contractEffectiveFromLabel: string;
  signedActivatedLabel: string;
  /** True when legacy check-in auto-complete was reverted on load — refresh workspace chrome. */
  repairedAutoComplete: boolean;
};

export async function loadHireEndHirePageAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireEndHirePageData } | { ok: false; error: string }> {
  let authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  let repairedAutoComplete = false;
  if (
    await repairAutoCompletedEndHireIfNeeded({
      id: authorized.hire.id,
      parentCompanyId: authorized.hire.parentCompanyId,
      status: authorized.hire.status,
      endHireDraft: authorized.hire.endHireDraft,
      checkinCompleted: authorized.hire.checkinCompleted,
      terminatedAt: authorized.hire.terminatedAt,
    })
  ) {
    repairedAutoComplete = true;
    authorized = await authorizeEndHireWrite(hireGroupId);
    if (!authorized.ok) return authorized;
  }

  const { hire } = authorized;

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, start_date, start_time, activated_at, vehicles(vrm)")
    .eq("id", hire.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const nowIso = new Date().toISOString();
  const draft =
    hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());

  let effectiveDraft = draft;
  if (hire.status === "ending") {
    effectiveDraft = {
      ...draft,
      started: true,
      step: draft.step === "checkin" || draft.step === "final_account" ? "return_details" : draft.step,
      updatedAt: draft.updatedAt || nowIso,
    };
  } else if (hire.status === "terminated" || hire.status === "completed") {
    if (hire.checkinCompleted) {
      effectiveDraft = {
        ...draft,
        started: true,
        step: "final_account",
        updatedAt: draft.updatedAt || nowIso,
      };
    } else {
      effectiveDraft = {
        ...draft,
        started: true,
        step: "checkin",
        updatedAt: draft.updatedAt || nowIso,
      };
    }
  }

  let financialReview: HireEndHireFinancialReview | null = null;
  let pendingApprovalItems: HireEndHirePendingApprovalItem[] = [];
  let pendingScheduleRows: HirePaymentPageRow[] = [];
  let extraChargePendingPayment: HireEndHirePageData["extraChargePendingPayment"] = null;
  let extraChargesOutstandingGbp = 0;
  let canApprovePayments = false;
  if (effectiveDraft.started && effectiveDraft.returnDateYmd) {
    const returnedAtIso =
      hireEndHireReturnedAtIso(
        effectiveDraft.returnDateYmd,
        effectiveDraft.returnTimeHm || "12:00",
      ) ?? undefined;
    const payments = await loadHirePaymentsPageAction(hire.id);
    if (payments.ok) {
      canApprovePayments = payments.data.canApprovePayments;
      extraChargePendingPayment = payments.data.extraChargePendingPayment;
      extraChargesOutstandingGbp = payments.data.extraChargesOutstandingGbp;
      pendingScheduleRows = payments.data.rows.filter(
        (row) => row.paymentStatus === "pending_approval",
      );
      pendingApprovalItems = buildHireEndHirePendingApprovalItems({
        scheduleRows: payments.data.rows,
        pendingAmountForRow: hirePaymentPendingApprovalAmountGbp,
        extraChargePending: payments.data.extraChargePendingPayment,
        extraChargesOutstandingGbp: payments.data.extraChargesOutstandingGbp,
      });
      let rentChargedGbp = payments.data.summary.totalDueGbp;
      let rentReceivedGbp = payments.data.summary.totalPaidGbp;
      if (canTerminateHire(hire.status) && returnedAtIso) {
        const preview = await loadHireTerminationPreviewAction(
          hire.id,
          PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
          null,
          "actual",
          returnedAtIso,
        );
        if (preview.ok) {
          rentChargedGbp = preview.data.accounts.accruedRentDueGbp;
          rentReceivedGbp = preview.data.accounts.accruedRentPaidGbp;
        }
      }
      financialReview = buildHireEndHireFinancialReview({
        returnDateYmd: effectiveDraft.returnDateYmd,
        returnTimeHm: effectiveDraft.returnTimeHm || "12:00",
        rentChargedGbp,
        rentReceivedGbp,
        depositRequiredGbp: Number(
          payments.data.terminationSummary?.depositGbp ??
            payments.data.rows.find((row) => row.rowKind === "deposit")?.netDueGbp ??
            0,
        ),
        depositReceivedGbp: Number(payments.data.depositReceivedGbp ?? 0),
        extraCharges: payments.data.driverChargeLineItems.map((item) => ({
          id: item.id,
          chargeType: item.chargeType,
          chargeTypeLabel: item.chargeTypeLabel,
          description: item.description,
          amountGbp: item.amountGbp,
          resolution: item.resolution,
        })),
        // Same outstanding figure as Payments — nets approved driver_charge receipts.
        extraChargesOutstandingGbp: payments.data.extraChargesOutstandingGbp,
        pendingApprovalItems,
      });
    }
  }

  const vehicle = group.vehicles as { vrm?: string } | null;
  const startDate = (group.start_date as string | null) ?? null;
  const startTime = (group.start_time as string | null)?.slice(0, 5) || "09:00";

  return {
    ok: true,
    data: {
      hireGroupId: hire.id,
      hireGroupIdShort: hire.id.slice(0, 8),
      vehicleVrm: vehicle?.vrm?.trim() || "—",
      status: hire.status,
      draft: effectiveDraft,
      checkinCompleted: hire.checkinCompleted,
      canStartCheckin: canStartCheckin({
        status: hire.status,
        checkoutCompleted: hire.checkoutCompleted,
        checkinCompleted: hire.checkinCompleted,
      }),
      canConfirmReturn: canTerminateHire(hire.status),
      canCancelEndHire: canCancelHireEndHireProcess({
        status: hire.status,
        draft: effectiveDraft,
      }),
      canFinalizeEndHire: canFinalizeHireEndHireProcess({
        status: hire.status,
        checkinCompleted: hire.checkinCompleted,
        draft: effectiveDraft,
      }),
      isEndHireFinalized: isHireEndHireFinalized({
        status: hire.status,
        draft: effectiveDraft,
      }),
      financialReview,
      pendingApprovalItems,
      pendingScheduleRows,
      extraChargePendingPayment,
      extraChargesOutstandingGbp,
      canApprovePayments,
      openBalanceGbp: Math.abs(hire.settlementBalanceGbp),
      contractEffectiveFromLabel: formatUkDateAtTime(startDate, startTime),
      signedActivatedLabel: group.activated_at
        ? formatUkDateTime(group.activated_at as string)
        : "—",
      repairedAutoComplete,
    },
  };
}

export async function startHireEndHireAction(
  hireGroupId: string,
): Promise<{ ok: true; draft: HireEndHireDraft } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;
  if (authorized.hire.status !== "active" && authorized.hire.status !== "ending") {
    return { ok: false, error: "Only an active hire can start contract termination." };
  }

  const nowIso = new Date().toISOString();
  const base =
    authorized.hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());
  const draft: HireEndHireDraft = {
    ...base,
    started: true,
    step: !base.started ? "return_details" : base.step,
    updatedAt: nowIso,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({
      end_hire_draft: draft,
      status: "ending",
    })
    .eq("id", authorized.hire.id)
    .eq("parent_company_id", authorized.hire.parentCompanyId)
    .in("status", ["active", "ending"]);
  if (error) return { ok: false, error: error.message };

  await revalidateEndHire(authorized.hire.id, authorized.hire.parentCompanyId);
  return { ok: true, draft };
}

export async function cancelHireEndHireAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const { hire } = authorized;
  if (
    !canCancelHireEndHireProcess({
      status: hire.status,
      draft: hire.endHireDraft,
    })
  ) {
    return {
      ok: false,
      error: hire.endHireDraft?.explicitFinalization
        ? "Contract termination is already finalised and can no longer be cancelled."
        : "There is no end-hire process to cancel.",
    };
  }

  const { profile, user } = await requireRentalCompanyArea();
  void profile;

  // Block reverse if final settlement money was already recorded (beyond check-in damage receipts).
  if (hire.status === "terminated" || hire.status === "completed") {
    const supabase = await createClient();
    const { data: settlementPayments } = await supabase
      .from("vehicle_hire_balance_payments")
      .select("id")
      .eq("hire_group_id", hire.id)
      .eq("payment_category", "settlement")
      .limit(1);
    if ((settlementPayments ?? []).length > 0) {
      return {
        ok: false,
        error:
          "Settlement payments have already been recorded. Cancel ending is no longer available.",
      };
    }
  }

  const admin = createSupabaseAdminClient();

  if (hire.status === "terminated" || hire.status === "completed") {
    // Reverse check-in: remove inspection (+ cascaded damages/media) and check-in damage charges/payments.
    const { data: checkinCharges } = await admin
      .from("vehicle_hire_driver_charge_line_items")
      .select("id, balance_payment_id")
      .eq("hire_group_id", hire.id)
      .eq("source_kind", "checkin_inspection_damage");

    const paymentIds = [
      ...new Set(
        (checkinCharges ?? [])
          .map((row) => (row.balance_payment_id as string | null)?.trim() || "")
          .filter(Boolean),
      ),
    ];

    const { error: chargeDeleteError } = await admin
      .from("vehicle_hire_driver_charge_line_items")
      .delete()
      .eq("hire_group_id", hire.id)
      .eq("source_kind", "checkin_inspection_damage");
    if (chargeDeleteError) return { ok: false, error: chargeDeleteError.message };

    if (paymentIds.length > 0) {
      const { error: paymentDeleteError } = await admin
        .from("vehicle_hire_balance_payments")
        .delete()
        .eq("hire_group_id", hire.id)
        .in("id", paymentIds);
      if (paymentDeleteError) return { ok: false, error: paymentDeleteError.message };
    }

    // Also remove orphaned check-in damage receipts by note (paid_now may not link via charge row).
    await admin
      .from("vehicle_hire_balance_payments")
      .delete()
      .eq("hire_group_id", hire.id)
      .eq("payment_category", "driver_charge")
      .ilike("notes", "%check-in%");

    const { error: inspectionDeleteError } = await admin
      .from("vehicle_hire_inspections")
      .delete()
      .eq("hire_group_id", hire.id)
      .eq("kind", "checkin");
    if (inspectionDeleteError) return { ok: false, error: inspectionDeleteError.message };

    await admin
      .from("vehicle_hire_agreements")
      .update({ status: "active" })
      .eq("hire_group_id", hire.id)
      .eq("status", "terminated");
  }

  const { error } = await admin
    .from("vehicle_hire_groups")
    .update({
      status: "active",
      end_hire_draft: null,
      terminated_at: null,
      termination_reason: null,
      deposit_disposition: null,
      deposit_disposition_reason: null,
      deposit_refund_amount_gbp: null,
      termination_settlement: {},
      settlement_resolution: null,
      settlement_discount_gbp: null,
      settlement_balance_gbp: null,
      settlement_balance_direction: null,
      driver_documents_retain_until: null,
    })
    .eq("id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .in("status", ["ending", "terminated", "completed"]);
  if (error) return { ok: false, error: error.message };

  await syncVehicleStatusForHireGroup(admin, hire.id);
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "hire_status_changed",
    summary:
      hire.status === "terminated"
        ? "End hire cancelled — contract restored to active; check-in and provisional termination reversed."
        : "End hire cancelled — contract restored to active.",
    actorRole: "company_staff",
    actorUserId: user.id,
  });

  await revalidateEndHire(hire.id, hire.parentCompanyId);
  return { ok: true };
}

export async function saveHireEndHireDraftAction(input: {
  hireGroupId: string;
  step?: HireEndHireStep;
  returnDateYmd?: string;
  returnTimeHm?: string;
  reason?: string;
  notes?: string;
}): Promise<{ ok: true; draft: HireEndHireDraft } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;

  const nowIso = new Date().toISOString();
  const previous =
    authorized.hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());

  const reasonRaw = input.reason ?? previous.reason;
  if (reasonRaw && !isHireEndHireReturnReason(reasonRaw)) {
    return { ok: false, error: "Choose a valid return reason." };
  }
  const step = input.step ?? previous.step;
  if (!isHireEndHireStep(step)) return { ok: false, error: "Invalid step." };

  const draft: HireEndHireDraft = {
    started: true,
    step,
    returnDateYmd: (input.returnDateYmd ?? previous.returnDateYmd).trim(),
    returnTimeHm: (input.returnTimeHm ?? previous.returnTimeHm).trim(),
    reason: (reasonRaw || "") as HireEndHireReturnReason | "",
    notes: (input.notes ?? previous.notes).trim(),
    updatedAt: nowIso,
    finalizedAt: previous.finalizedAt,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: draft })
    .eq("id", authorized.hire.id)
    .eq("parent_company_id", authorized.hire.parentCompanyId);
  if (error) return { ok: false, error: error.message };

  await revalidateEndHire(authorized.hire.id, authorized.hire.parentCompanyId);
  return { ok: true, draft };
}

export async function confirmHireEndHireReturnAction(input: {
  hireGroupId: string;
  returnDateYmd: string;
  returnTimeHm: string;
  reason: string;
  notes?: string;
}): Promise<{ ok: true; checkInHref: string } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  if (!canTerminateHire(authorized.hire.status)) {
    return { ok: false, error: "Only an active hire can be confirmed for return." };
  }
  if (!isHireEndHireReturnReason(input.reason)) {
    return { ok: false, error: "Choose a reason for ending." };
  }
  const returnedAtIso = hireEndHireReturnedAtIso(input.returnDateYmd, input.returnTimeHm);
  if (!returnedAtIso) return { ok: false, error: "Enter a valid return date and time." };

  const notes = [`Return reason: ${input.reason}`, input.notes?.trim() || null]
    .filter(Boolean)
    .join(" · ");

  const preview = await loadHireTerminationPreviewAction(
    authorized.hire.id,
    PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
    null,
    "actual",
    returnedAtIso,
  );
  if (!preview.ok) return preview;

  const terminated = await terminateHireGroupAction({
    hireGroupId: authorized.hire.id,
    confirmedIdentity: true,
    finalConfirmed: true,
    rentBillingMode: "actual",
    terminationNotes: notes,
    depositDisposition: PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
    settlementResolution: "open_balance",
    returnedAtIso,
  });
  if (!terminated.ok) return terminated;

  const nowIso = new Date().toISOString();
  const draft: HireEndHireDraft = {
    started: true,
    step: "checkin",
    returnDateYmd: input.returnDateYmd.trim(),
    returnTimeHm: input.returnTimeHm.trim(),
    reason: input.reason,
    notes: input.notes?.trim() || "",
    updatedAt: nowIso,
    finalizedAt: null,
  };

  const supabase = await createClient();
  await supabase
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: draft })
    .eq("id", authorized.hire.id)
    .eq("parent_company_id", authorized.hire.parentCompanyId);

  await revalidateEndHire(authorized.hire.id, authorized.hire.parentCompanyId);
  return { ok: true, checkInHref: `/rental/hires/${authorized.hire.id}/end-hire` };
}

export async function finalizeHireEndHireAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const { hire } = authorized;
  const nowIso = new Date().toISOString();
  const previous =
    hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());

  if (
    !canFinalizeHireEndHireProcess({
      status: hire.status,
      checkinCompleted: hire.checkinCompleted,
      draft: previous,
    })
  ) {
    return {
      ok: false,
      error: isHireEndHireFinalized({ status: hire.status, draft: previous })
        ? "Contract termination is already finalised."
        : "Complete check-in and review the final account before finalising.",
    };
  }

  const { user } = await requireRentalCompanyArea();
  const admin = createSupabaseAdminClient();

  const { data: groupRow, error: groupError } = await admin
    .from("vehicle_hire_groups")
    .select("terminated_at, ended_at, status")
    .eq("id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .in("status", ["terminated", "completed"])
    .maybeSingle();
  if (groupError) return { ok: false, error: groupError.message };
  if (!groupRow) {
    return { ok: false, error: "Only a hire awaiting finalisation can be completed." };
  }

  const endedAt =
    (groupRow.terminated_at as string | null)?.trim() ||
    (groupRow.ended_at as string | null)?.trim() ||
    nowIso;
  const draft: HireEndHireDraft = {
    ...previous,
    started: true,
    step: "final_account",
    updatedAt: nowIso,
    finalizedAt: nowIso,
    explicitFinalization: true,
  };

  const { error: updateError } = await admin
    .from("vehicle_hire_groups")
    .update({
      status: "completed",
      ended_at: endedAt,
      end_hire_draft: draft,
    })
    .eq("id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .in("status", ["terminated", "completed"]);
  if (updateError) return { ok: false, error: updateError.message };

  await cancelOpenSubcompanyDocumentRequirementsForHire(admin, hire.id, user.id);
  await syncVehicleStatusForHireGroup(admin, hire.id);
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "hire_status_changed",
    summary: "Contract termination finalised — hire completed.",
    actorRole: "company_staff",
    actorUserId: user.id,
  });

  await revalidateEndHire(hire.id, hire.parentCompanyId);
  return { ok: true };
}
