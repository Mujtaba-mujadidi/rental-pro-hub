"use server";

import { revalidatePath } from "next/cache";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import { assertStaffHireSubcompanyAccess } from "@/lib/auth/rental-subcompany-access";
import { formatUkDateAtTime, formatUkDateTime, ukTodayYmd } from "@/lib/datetime/uk";
import { formatRentLabel } from "@/lib/fleet/hire-access-display";
import {
  canCancelHireEndHireProcess,
  canFinalizeHireEndHireProcess,
  emptyHireEndHireDraft,
  hireEndHireReturnedAtIso,
  hireEndHireStepNeedsFinancialReview,
  isHireEndHireAutoCompletedBeforeFinalisation,
  isHireEndHireFinalized,
  isHireEndHireReturnReason,
  isHireEndHireStep,
  parseHireEndHireDraft,
  parseHireEndHireRentBillingMode,
  resolveEffectiveHireEndHireDraft,
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
import {
  hireTerminationRentBillingDetail,
  hireTerminationRentBillingLabel,
} from "@/lib/fleet/hire-termination-billing";
import {
  formatHireDurationWeeksAndDays,
  formatRentBilledThroughReturnLabel,
  hireRentTerminationAdjustmentDisplay,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import type { RentCadence } from "@/lib/fleet/hire-types";
import { canStartCheckin, canTerminateHire } from "@/lib/fleet/hire-lifecycle-attention";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { HIRE_RETURN_CHARGE_SOURCE_KINDS } from "@/lib/fleet/hire-return-charges";
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
import {
  loadHireReturnChargesAction,
  commitHireReturnChargesFromDraftAction,
  type HireReturnChargesPageData,
} from "@/app/actions/hire-return-charges";
import { resolveHireDepositDispositionAction } from "@/app/actions/rental-hire-termination";
import { areReturnChargesReady } from "@/lib/fleet/hire-return-charges";

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

function rentDetailFromTerminationAccounts(
  accounts: HireTerminationAccountsSummary,
  billingMode: HireTerminationRentBillingMode,
  contractStartYmd: string | null,
  contractActivatedAt: string | null,
): {
  rentChargedGbp: number;
  rentReceivedGbp: number;
  rentGrossAccruedGbp: number;
  rentDiscountGbp: number;
  rentCadence: RentCadence;
  billedPeriodsLabel: string;
  rentBillingLabel: string;
  rentBillingDetail: string | null;
  proRataAdjustmentGbp: number | null;
  proRataLineLabel: string | null;
  proRataNote: string | null;
  contractActivatedLabel: string | null;
  hireLengthSinceActivationLabel: string | null;
} {
  const adjustment = hireRentTerminationAdjustmentDisplay({
    rentCadence: accounts.rentCadence,
    rentBillingMode: billingMode,
    billingPeriodBreakdown: accounts.billingPeriodBreakdown,
    rentGrossAccruedGbp: accounts.rentGrossAccruedGbp,
    totalDiscountGbp: accounts.totalDiscountGbp,
    accruedRentDueGbp: accounts.accruedRentDueGbp,
  });
  const activatedYmd = accounts.activatedAt?.slice(0, 10) ?? null;
  const contractActivatedLabel =
    contractActivatedAt && activatedYmd && contractStartYmd && activatedYmd !== contractStartYmd
      ? formatUkDateTime(contractActivatedAt)
      : null;

  return {
    rentChargedGbp: accounts.accruedRentDueGbp,
    rentReceivedGbp: accounts.accruedRentPaidGbp,
    rentGrossAccruedGbp: accounts.rentGrossAccruedGbp,
    rentDiscountGbp: accounts.totalDiscountGbp,
    rentCadence: accounts.rentCadence,
    billedPeriodsLabel: formatRentBilledThroughReturnLabel(
      accounts.rentCadence,
      accounts.rentBilledPeriods,
      accounts.rentBilledDurationDays,
    ),
    rentBillingLabel: hireTerminationRentBillingLabel(billingMode, accounts.rentCadence),
    rentBillingDetail: hireTerminationRentBillingDetail(
      billingMode,
      accounts.rentCadence,
      accounts.billingPeriodBreakdown,
    ),
    proRataAdjustmentGbp: adjustment?.adjustmentGbp ?? null,
    proRataLineLabel: adjustment?.lineLabel ?? null,
    proRataNote: adjustment?.footnote ?? null,
    contractActivatedLabel,
    hireLengthSinceActivationLabel:
      contractActivatedLabel != null ? formatHireDurationWeeksAndDays(accounts.durationDays) : null,
  };
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
        settlementBalanceDirection: string | null;
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
    .select(
      "id, status, parent_company_id, subcompany_id, end_hire_draft, settlement_balance_gbp, settlement_balance_direction, terminated_at",
    )
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
      settlementBalanceDirection: (group.settlement_balance_direction as string | null) ?? null,
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
  rentCadence: RentCadence;
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
    allocations?: Array<{
      chargeLineItemId: string;
      amountGbp: number;
      label?: string;
    }>;
  } | null;
  extraChargesOutstandingGbp: number;
  canApprovePayments: boolean;
  openBalanceGbp: number;
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled" | null;
  depositResolution: {
    canResolveDeposit: boolean;
    depositHeldGbp: number;
    depositReceivedGbp: number;
    currentSignedSettlementGbp: number;
    depositDisposition: string | null;
    terminationSummary: HireTerminationAccountsSummary | null;
  } | null;
  contractEffectiveFromLabel: string;
  signedActivatedLabel: string;
  /** True when legacy check-in auto-complete was reverted on load — refresh workspace chrome. */
  repairedAutoComplete: boolean;
  returnCharges: HireReturnChargesPageData | null;
};

export async function loadHireEndHirePageAction(
  hireGroupId: string,
  options?: { includeFinancialReview?: boolean },
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
  if (
    (hire.status === "ending" || hire.status === "terminated") &&
    !isHireEndHireFinalized({ status: hire.status, draft: hire.endHireDraft })
  ) {
    await syncVehicleStatusForHireGroup(createSupabaseAdminClient(), hire.id);
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, start_date, start_time, activated_at, rent_amount_gbp, rent_cadence, vehicles(vrm)")
    .eq("id", hire.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const nowIso = new Date().toISOString();
  const draft =
    hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());

  const effectiveDraft = resolveEffectiveHireEndHireDraft({
    status: hire.status,
    checkinCompleted: hire.checkinCompleted,
    draft,
    nowIso,
  });

  let financialReview: HireEndHireFinancialReview | null = null;
  let pendingApprovalItems: HireEndHirePendingApprovalItem[] = [];
  let pendingScheduleRows: HirePaymentPageRow[] = [];
  let extraChargePendingPayment: HireEndHirePageData["extraChargePendingPayment"] = null;
  let extraChargesOutstandingGbp = 0;
  let canApprovePayments = false;
  let returnCharges: HireReturnChargesPageData | null = null;
  let depositResolution: HireEndHirePageData["depositResolution"] = null;
  const vehicle = group.vehicles as { vrm?: string } | null;
  const startDate = (group.start_date as string | null) ?? null;
  const startTime = (group.start_time as string | null)?.slice(0, 5) || "09:00";
  const rentCadence = ((group.rent_cadence as RentCadence | null) ?? "weekly") as RentCadence;
  const includeFinancialReview =
    options?.includeFinancialReview ??
    (effectiveDraft.started &&
      Boolean(effectiveDraft.returnDateYmd) &&
      hireEndHireStepNeedsFinancialReview(effectiveDraft.step));

  if (includeFinancialReview && effectiveDraft.returnDateYmd) {
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
      depositResolution = {
        canResolveDeposit: payments.data.canResolveDeposit,
        depositHeldGbp: payments.data.depositReceivedGbp,
        depositReceivedGbp: payments.data.depositReceivedGbp,
        currentSignedSettlementGbp: payments.data.currentSignedSettlementGbp,
        depositDisposition: payments.data.depositDisposition,
        terminationSummary: payments.data.terminationSummary,
      };
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
      let rentGrossAccruedGbp = payments.data.summary.rentGrossAccruedGbp;
      let rentDiscountGbp = payments.data.summary.totalDiscountGbp;
      let billedPeriodsLabel: string | null = null;
      let rentBillingLabel: string | null = null;
      let rentBillingDetail: string | null = null;
      let proRataAdjustmentGbp: number | null = null;
      let proRataLineLabel: string | null = null;
      let proRataNote: string | null = null;
      let contractActivatedLabel: string | null = null;
      let hireLengthSinceActivationLabel: string | null = null;
      const billingMode =
        canTerminateHire(hire.status) || hire.status === "ending"
          ? effectiveDraft.rentBillingMode
          : (payments.data.terminationSummary?.rentBillingMode ?? effectiveDraft.rentBillingMode);
      if (canTerminateHire(hire.status) && returnedAtIso) {
        const preview = await loadHireTerminationPreviewAction(
          hire.id,
          PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
          null,
          billingMode,
          returnedAtIso,
          effectiveDraft.returnDateYmd,
        );
        if (preview.ok) {
          const detail = rentDetailFromTerminationAccounts(
            preview.data.accounts,
            billingMode,
            startDate,
            (group.activated_at as string | null) ?? null,
          );
          rentChargedGbp = detail.rentChargedGbp;
          rentReceivedGbp = detail.rentReceivedGbp;
          rentGrossAccruedGbp = detail.rentGrossAccruedGbp;
          rentDiscountGbp = detail.rentDiscountGbp;
          billedPeriodsLabel = detail.billedPeriodsLabel;
          rentBillingLabel = detail.rentBillingLabel;
          rentBillingDetail = detail.rentBillingDetail;
          proRataAdjustmentGbp = detail.proRataAdjustmentGbp;
          proRataLineLabel = detail.proRataLineLabel;
          proRataNote = detail.proRataNote;
          contractActivatedLabel = detail.contractActivatedLabel;
          hireLengthSinceActivationLabel = detail.hireLengthSinceActivationLabel;
        }
      } else if (payments.data.terminationSummary) {
        const detail = rentDetailFromTerminationAccounts(
          payments.data.terminationSummary,
          payments.data.terminationSummary.rentBillingMode,
          startDate,
          payments.data.terminationSummary.activatedAt,
        );
        rentChargedGbp = detail.rentChargedGbp;
        rentReceivedGbp = detail.rentReceivedGbp;
        rentGrossAccruedGbp = detail.rentGrossAccruedGbp;
        rentDiscountGbp = detail.rentDiscountGbp;
        billedPeriodsLabel = detail.billedPeriodsLabel;
        rentBillingLabel = detail.rentBillingLabel;
        rentBillingDetail = detail.rentBillingDetail;
        proRataAdjustmentGbp = detail.proRataAdjustmentGbp;
        proRataLineLabel = detail.proRataLineLabel;
        proRataNote = detail.proRataNote;
        contractActivatedLabel = detail.contractActivatedLabel;
        hireLengthSinceActivationLabel = detail.hireLengthSinceActivationLabel;
      }
      financialReview = buildHireEndHireFinancialReview({
        returnDateYmd: effectiveDraft.returnDateYmd,
        returnTimeHm: effectiveDraft.returnTimeHm || "12:00",
        rentChargedGbp,
        rentReceivedGbp,
        contractPeriodStartLabel: formatUkDateAtTime(startDate, startTime),
        contractActivatedLabel,
        hireLengthSinceActivationLabel,
        rentRateLabel: formatRentLabel(group.rent_amount_gbp, rentCadence),
        rentBillingLabel,
        rentBillingDetail,
        billedPeriodsLabel,
        rentGrossAccruedGbp,
        rentDiscountGbp,
        proRataAdjustmentGbp,
        proRataLineLabel,
        proRataNote,
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

  if (
    hire.checkinCompleted &&
    (effectiveDraft.step === "return_charges" || effectiveDraft.step === "final_account")
  ) {
    const returnChargesRes = await loadHireReturnChargesAction(hire.id);
    if (returnChargesRes.ok) {
      returnCharges = returnChargesRes.data;
    }
  }

  const hasReturnChargeWork = returnCharges
    ? returnCharges.newDamages.length > 0 ||
      returnCharges.fuelShortfall ||
      returnCharges.missingAccessories.length > 0
    : false;
  const returnChargesReady = returnCharges
    ? returnCharges.returnChargesReady
    : areReturnChargesReady({
        newDamages: [],
        returnChargesDraftSavedAt: effectiveDraft.returnChargesDraftSavedAt ?? null,
        returnChargesAppliedAt: effectiveDraft.returnChargesAppliedAt ?? null,
        hasReturnChargeWork: false,
      });

  return {
    ok: true,
    data: {
      hireGroupId: hire.id,
      hireGroupIdShort: hire.id.slice(0, 8),
      vehicleVrm: vehicle?.vrm?.trim() || "—",
      status: hire.status,
      rentCadence,
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
        returnChargesReady,
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
      settlementBalanceDirection:
        (hire.settlementBalanceDirection as HireEndHirePageData["settlementBalanceDirection"]) ??
        null,
      depositResolution,
      contractEffectiveFromLabel: formatUkDateAtTime(startDate, startTime),
      signedActivatedLabel: group.activated_at
        ? formatUkDateTime(group.activated_at as string)
        : "—",
      repairedAutoComplete,
      returnCharges,
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
      .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);

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
      .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);
    if (chargeDeleteError) return { ok: false, error: chargeDeleteError.message };

    if (paymentIds.length > 0) {
      const { error: paymentDeleteError } = await admin
        .from("vehicle_hire_balance_payments")
        .delete()
        .eq("hire_group_id", hire.id)
        .in("id", paymentIds);
      if (paymentDeleteError) return { ok: false, error: paymentDeleteError.message };
    }

    // Also remove orphaned return-charge receipts by note (paid_now may not link via charge row).
    await admin
      .from("vehicle_hire_balance_payments")
      .delete()
      .eq("hire_group_id", hire.id)
      .eq("payment_category", "driver_charge")
      .or("notes.ilike.%check-in%,notes.ilike.%return charge%");

    const { data: checkinInspections } = await admin
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", hire.id)
      .eq("kind", "checkin");
    const checkinInspectionIds = (checkinInspections ?? [])
      .map((row) => (row.id as string | null)?.trim() || "")
      .filter(Boolean);
    if (checkinInspectionIds.length > 0) {
      const { data: checkinMedia } = await admin
        .from("vehicle_hire_inspection_media")
        .select("file_path")
        .in("inspection_id", checkinInspectionIds);
      const mediaPaths = [
        ...new Set(
          (checkinMedia ?? [])
            .map((row) => (row.file_path as string | null)?.trim() || "")
            .filter(Boolean),
        ),
      ];
      if (mediaPaths.length > 0) {
        await admin.storage.from("hire-inspection-media").remove(mediaPaths);
      }
    }

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
  rentBillingMode?: HireTerminationRentBillingMode;
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
    rentBillingMode: parseHireEndHireRentBillingMode(
      input.rentBillingMode ?? previous.rentBillingMode,
    ),
    updatedAt: nowIso,
    finalizedAt: previous.finalizedAt,
    explicitFinalization: previous.explicitFinalization,
    returnChargesAppliedAt: previous.returnChargesAppliedAt ?? null,
    pendingReturnReviews: previous.pendingReturnReviews ?? null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: draft })
    .eq("id", authorized.hire.id)
    .eq("parent_company_id", authorized.hire.parentCompanyId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, draft };
}

export async function confirmHireEndHireReturnAction(input: {
  hireGroupId: string;
  returnDateYmd: string;
  returnTimeHm: string;
  reason: string;
  notes?: string;
  rentBillingMode: HireTerminationRentBillingMode;
}): Promise<{ ok: true; draft: HireEndHireDraft } | { ok: false; error: string }> {
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

  const rentBillingMode = parseHireEndHireRentBillingMode(input.rentBillingMode);

  const terminated = await terminateHireGroupAction({
    hireGroupId: authorized.hire.id,
    confirmedIdentity: true,
    finalConfirmed: true,
    rentBillingMode,
    terminationNotes: notes,
    depositDisposition: PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
    settlementResolution: "open_balance",
    returnedAtIso,
    returnDateYmd: input.returnDateYmd,
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
    rentBillingMode,
    updatedAt: nowIso,
    finalizedAt: null,
  };

  const supabase = await createClient();
  await supabase
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: draft })
    .eq("id", authorized.hire.id)
    .eq("parent_company_id", authorized.hire.parentCompanyId);

  return { ok: true, draft };
}

export async function finalizeHireEndHireAction(
  hireGroupId: string,
  input?: {
    depositDisposition?: string;
    depositDispositionReason?: string;
    depositRefundAmountGbp?: number;
    settlementResolution?: string;
    settlementPaymentMethod?: string;
    settlementPaymentReference?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await authorizeEndHireWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const { hire } = authorized;
  const nowIso = new Date().toISOString();
  const previous =
    hire.endHireDraft ?? emptyHireEndHireDraft(nowIso, ukTodayYmd(), londonTimeHmNow());

  const returnChargesRes = await loadHireReturnChargesAction(hire.id);
  const returnChargesReady = returnChargesRes.ok
    ? returnChargesRes.data.returnChargesReady
    : false;

  if (
    !canFinalizeHireEndHireProcess({
      status: hire.status,
      checkinCompleted: hire.checkinCompleted,
      draft: previous,
      returnChargesReady,
    })
  ) {
    return {
      ok: false,
      error: isHireEndHireFinalized({ status: hire.status, draft: previous })
        ? "Contract termination is already finalised."
        : returnChargesRes.ok && returnChargesRes.data.newDamages.length > 0
          ? "Save return charges and resolve each new damage before finalising."
          : returnChargesRes.ok &&
              (returnChargesRes.data.fuelShortfall ||
                returnChargesRes.data.missingAccessories.length > 0) &&
              !returnChargesRes.data.returnChargesDraftSavedAt
            ? "Save return charges before continuing to the final account."
            : "Complete check-in and review the final account before finalising.",
    };
  }

  if (previous.returnChargesDraft && !previous.returnChargesAppliedAt?.trim()) {
    const commitRes = await commitHireReturnChargesFromDraftAction(hire.id);
    if (!commitRes.ok) return commitRes;
  }

  const paymentsAfterCharges = await loadHirePaymentsPageAction(hire.id);
  if (paymentsAfterCharges.ok && paymentsAfterCharges.data.canResolveDeposit) {
    if (!input?.depositDisposition?.trim()) {
      return { ok: false, error: "Choose what to do with the held deposit before confirming." };
    }
    const depositRes = await resolveHireDepositDispositionAction({
      hireGroupId: hire.id,
      depositDisposition: input.depositDisposition,
      depositDispositionReason: input.depositDispositionReason,
      depositRefundAmountGbp: input.depositRefundAmountGbp,
      settlementResolution: input.settlementResolution,
      settlementPaymentMethod: input.settlementPaymentMethod,
      settlementPaymentReference: input.settlementPaymentReference,
    });
    if (!depositRes.ok) return depositRes;
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
