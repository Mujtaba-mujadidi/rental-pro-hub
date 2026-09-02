"use server";

/**
 * Hire payment schedule actions (active hire rent/deposit on the sheet).
 * Transaction side effects: see @/lib/fleet/hire-payment-transactions.ts
 */

import { getSessionUser, requireRentalCompanyArea, type AppProfile } from "@/lib/auth/profile";
import { can, canReadRentals } from "@/lib/auth/rental-permissions";
import { assertStaffHireSubcompanyAccess } from "@/lib/auth/rental-subcompany-access";
import { formatUkDate, formatUkDateRange, formatUkDateTimeSeconds, ukTodayYmd } from "@/lib/datetime/uk";
import { hireContractEndYmd } from "@/lib/fleet/hire-income";
import { isHirePaymentsWorkspaceOpen } from "@/lib/fleet/hire-lifecycle-attention";
import {
  driverDocumentsRetentionWarning as getDriverDocumentsRetentionWarning,
} from "@/lib/fleet/hire-document-retention";
import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import {
  canStaffRecordPaymentAllocation,
  canTransitionPaymentStatus,
  nextStatusAfterApprovedAmountAmendment,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import {
  enrichHirePaymentRows,
  summarizeHirePayments,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { isDepositDispositionPending, hireDepositHeldGbp } from "@/lib/fleet/hire-deposit-resolution";
import { reconcileEndedHirePaymentsWithDepositCredit } from "@/lib/fleet/hire-deposit-schedule-allocation";
import {
  signedSettlementBalanceGbp,
} from "@/lib/fleet/hire-open-balance";
import {
  filterPaymentScheduleForEndedContract,
  adjustEndedContractPaymentRowDues,
  hasPostEndPrepaidRows,
} from "@/lib/fleet/hire-ended-payment-schedule";
import {
  parseHireEndHireDraft,
} from "@/lib/fleet/hire-end-hire";
import type { HireEndedPendingChargeReview, HireEndedPendingReviewsSummary } from "@/lib/fleet/hire-ended-balance-case";
import {
  buildActiveHireAccountPosition,
  buildEndedHireAccountPosition,
} from "@/lib/fleet/hire-account-adapters";
import { buildHireSettlementBreakdown, type HireSettlementBreakdown } from "@/lib/fleet/hire-settlement-breakdown";
import { loadHireCheckinCompleted } from "@/lib/fleet/hire-inspection-status";
import { canFinalizeHireSettlement } from "@/lib/fleet/hire-settlement-finalization";
import {
  mapDriverChargeLineItemsFromDb,
  outstandingExtraChargesGbp,
  toHireDriverChargeWorkspaceView,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import {
  EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
  outstandingExtraChargesFromTimedPaymentsGbp,
  resolveOpenExtraChargePayment,
} from "@/lib/fleet/hire-driver-charge-payment";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import {
  mergeHirePaymentRowHistory,
  type HirePaymentRowEventDisplay,
} from "@/lib/fleet/hire-payment-row-history";
import {
  loadHireAuditActorDisplayNames,
  logHireGroupEvent,
  type HireGroupEventType,
} from "@/lib/fleet/hire-audit";
import { notifyCompanyHirePaymentReviewers, notifyHireDriver } from "@/lib/platform-notifications";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import { parseStaffManualChargeDateYmd } from "@/lib/fleet/hire-driver-charge-mutation";
import { settlementPaymentMethodRequiresAccount } from "@/lib/fleet/hire-settlement-payment-method";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import {
  settlementResolutionLabel,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import type {
  HireBalancePaymentAccountOption,
  HireBalancePaymentRow,
} from "@/app/actions/rental-hire-termination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export type HirePaymentAccountDisplay = {
  name: string;
  payeeName: string | null;
  sortCode: string | null;
  accountNumberMasked: string | null;
};

export type HirePaymentRowDiscount = {
  id: string;
  amountGbp: number;
  reason: string;
};

export type HirePaymentPageRow = HirePaymentScheduleRowInput & {
  periodLabel: string;
  netDueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  accrued: boolean;
  discounts: HirePaymentRowDiscount[];
};

export type HirePaymentsPageData = {
  hireGroupId: string;
  vehicleVrm: string;
  driverLabel: string | null;
  hireStatus: string;
  contractEndedYmd: string | null;
  contractEndedAtLabel: string | null;
  driverDocumentsRetainUntilLabel: string | null;
  driverDocumentsRetentionWarning: string | null;
  scheduleShowsEndedContractOnly: boolean;
  hasPostEndPrepaidPayments: boolean;
  scheduleReadOnly: boolean;
  settlementBalance: import("@/lib/fleet/hire-workspace-settlement-balance").HireWorkspaceSettlementBalance | null;
  canRecordSettlementPayment: boolean;
  settlementPaymentAccounts: HireBalancePaymentAccountOption[];
  defaultSettlementPaymentAccountId: string | null;
  settlementBalancePayments: Array<
    HireBalancePaymentRow & { direction: "received_from_driver" | "paid_to_driver" }
  >;
  terminationSummary: HireTerminationAccountsSummary | null;
  depositDispositionLabel: string | null;
  depositDisposition: string | null;
  depositPendingReview: boolean;
  /**
   * Deposit cash currently held pending disposition (amount received).
   * Null when nothing is held. Not the contractual deposit requirement —
   * use `terminationSummary.depositGbp` or the deposit schedule row for that.
   */
  depositGbp: number | null;
  /** Confirmed deposit money received (0 if contractual deposit unpaid). */
  depositReceivedGbp: number;
  /** Authoritative hire account position for this payments page load. */
  accountPosition: import("@/lib/fleet/hire-account-position").HireAccountPosition | null;
  currentSignedSettlementGbp: number;
  checkinCompleted: boolean;
  canFinalizeSettlement: boolean;
  canResolveDeposit: boolean;
  settlementResolutionLabel: string | null;
  settlementBreakdown: HireSettlementBreakdown | null;
  driverChargeLineItems: HireDriverChargeWorkspaceRow[];
  extraChargesOutstandingGbp: number;
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
  /** Payment recorded/approved events used to restore per-line allocations. */
  extraChargeAllocationEvents: Array<{
    eventType: string;
    metadata: Record<string, unknown> | null;
  }>;
  /** Approved extra-charge receipts with timestamps for per-line allocation. */
  extraChargeTimedPayments: Array<{
    id: string;
    amountGbp: number;
    paidAt: string;
  }>;
  canMutateExtraCharges: boolean;
  summary: ReturnType<typeof summarizeHirePayments>;
  rows: HirePaymentPageRow[];
  paymentAccount: HirePaymentAccountDisplay | null;
  canSubmitPayment: boolean;
  canApprovePayments: boolean;
  canApplyDiscount: boolean;
  /** Pending deposit / return-charge decisions after end-hire (staff balances). */
  pendingReviews: HireEndedPendingReviewsSummary;
};

type DbScheduleRow = {
  id: string;
  period_start: string;
  period_end: string;
  row_kind: string;
  base_amount_gbp: number;
  payment_status: string;
  approved_amount_gbp: number | null;
  sort_order: number;
  expected_payment_account_id: string | null;
  vehicle_hire_schedule_discounts?: { id: string; amount_gbp: number; reason: string }[];
};

function maskAccountNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `···${digits.slice(-4)}`;
}

function roundGbpSum(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function mapDbRow(
  row: DbScheduleRow,
  eventStateByRow: Map<string, PaymentRowEventState>,
  todayYmd: string,
): HirePaymentScheduleRowInput {
  const discounts = row.vehicle_hire_schedule_discounts ?? [];
  const discountTotalGbp = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const storedStatus = row.payment_status as HirePaymentStatus;
  const eventState = eventStateByRow.get(row.id);
  const workflowStatus = resolveHirePaymentWorkflowStatus(
    storedStatus,
    eventState?.latestToStatus ?? null,
    { periodStartYmd: row.period_start, todayYmd },
  );
  const pendingSubmittedGbp =
    workflowStatus === "pending_approval" ? (eventState?.pendingSubmittedGbp ?? null) : null;
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowKind: row.row_kind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: Number(row.base_amount_gbp),
    discountTotalGbp,
    paymentStatus: workflowStatus,
    approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
    pendingSubmittedGbp,
    sortOrder: row.sort_order,
  };
}

type PaymentRowEventState = {
  latestToStatus: string | null;
  pendingSubmittedGbp: number | null;
};

/** Latest status-change event per row, plus submitted amount when awaiting approval. */
async function loadPaymentRowEventState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rowIds: string[],
): Promise<Map<string, PaymentRowEventState>> {
  const map = new Map<string, PaymentRowEventState>();
  if (!rowIds.length) return map;

  const { data, error } = await supabase
    .from("vehicle_hire_payment_status_events")
    .select("schedule_row_id, to_status, amendment_payload, created_at")
    .in("schedule_row_id", rowIds)
    .eq("event_kind", "status_change")
    .order("created_at", { ascending: false });
  if (error) return map;

  const seen = new Set<string>();
  for (const event of data ?? []) {
    const rowId = event.schedule_row_id as string;
    if (seen.has(rowId)) continue;
    seen.add(rowId);
    const toStatus = (event.to_status as string | null) ?? null;
    let pendingSubmittedGbp: number | null = null;
    if (toStatus === "pending_approval") {
      const payload = (event.amendment_payload ?? {}) as { submittedAmountGbp?: number };
      const amount = Number(payload.submittedAmountGbp);
      if (Number.isFinite(amount) && amount > 0) pendingSubmittedGbp = amount;
    }
    map.set(rowId, { latestToStatus: toStatus, pendingSubmittedGbp });
  }
  return map;
}

async function loadPaymentAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string | null,
  parentCompanyId?: string | null,
): Promise<HirePaymentAccountDisplay | null> {
  if (!accountId) return null;
  let query = supabase
    .from("company_payment_accounts")
    .select("name, payee_name, sort_code, account_number")
    .eq("id", accountId);
  if (parentCompanyId) query = query.eq("parent_company_id", parentCompanyId);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  return {
    name: (data.name as string)?.trim() || "Bank account",
    payeeName: (data.payee_name as string | null)?.trim() || null,
    sortCode: (data.sort_code as string | null)?.trim() || null,
    accountNumberMasked: maskAccountNumber(data.account_number as string | null),
  };
}

function driverHirePaymentsHref(hireGroupId: string): string {
  return `/driver/hires/${hireGroupId}/payments`;
}

async function loadHireDriverNotificationContext(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  hireGroupId: string,
): Promise<{ driverUserId: string | null; vehicleVrm: string } | null> {
  const { data: group, error } = await admin
    .from("vehicle_hire_groups")
    .select("driver_user_id, vehicle_id, vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error || !group) return null;

  let vehicleVrm = (group.vehicles as { vrm?: string } | null)?.vrm?.trim() || "";
  if (!vehicleVrm && group.vehicle_id) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("vrm")
      .eq("id", group.vehicle_id as string)
      .maybeSingle();
    vehicleVrm = (vehicle?.vrm as string | undefined)?.trim() || "";
  }

  return {
    driverUserId: (group.driver_user_id as string | null) ?? null,
    vehicleVrm: vehicleVrm || "Vehicle",
  };
}

async function notifyDriverHirePaymentOutcome(
  hireGroupId: string,
  type: "hire_payment_approved" | "hire_payment_rejected" | "hire_payment_amended",
  payload: { amountGbp?: number; comment?: string; previousAmountGbp?: number },
): Promise<void> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("notifyDriverHirePaymentOutcome", e);
    return;
  }

  const context = await loadHireDriverNotificationContext(admin, hireGroupId);
  if (!context) return;

  await notifyHireDriver(admin, context.driverUserId, type, {
    hireGroupId,
    vehicleVrm: context.vehicleVrm,
    amountGbp: payload.amountGbp,
    comment: payload.comment,
    previousAmountGbp: payload.previousAmountGbp,
    href: driverHirePaymentsHref(hireGroupId),
  });
}

async function buildPaymentsPageData(
  hireGroupId: string,
  options: { driverUserId?: string },
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: group, error: groupErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, terminated_at, ended_at, parent_company_id, subcompany_id, driver_user_id, driver_email, driver_licence_number, default_payment_account_id, settlement_balance_gbp, settlement_balance_direction, driver_documents_retain_until, deposit_disposition, deposit_refund_amount_gbp, settlement_resolution, termination_settlement, end_hire_draft, vehicles(vrm)",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (groupErr) return { ok: false, error: "Could not load hire payments." };
  if (!group) return { ok: false, error: "Hire not found." };

  if (options.driverUserId && group.driver_user_id !== options.driverUserId) {
    return { ok: false, error: "You are not authorised to view this hire." };
  }

  let staffProfile: AppProfile | null = null;
  if (!options.driverUserId) {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    const companyId = profile.company_id?.trim();
    if (!companyId || (group.parent_company_id as string | null) !== companyId) {
      return { ok: false, error: "Hire not found." };
    }
    const scope = await assertStaffHireSubcompanyAccess(
      profile,
      (group.subcompany_id as string | null) ?? null,
    );
    if (!scope.ok) return scope;
    staffProfile = profile;
  }

  const hireStatus = String(group.status ?? "");
  const terminatedAt = (group.terminated_at as string | null) ?? null;
  const endedAt = (group.ended_at as string | null) ?? null;
  const contractEndedYmd = hireContractEndYmd({
    status: hireStatus,
    terminatedAt,
    endedAt,
  });
  const contractEndedAtLabel =
    terminatedAt != null
      ? formatUkDateTimeSeconds(terminatedAt)
      : endedAt != null
        ? formatUkDateTimeSeconds(endedAt)
        : null;
  const retainUntilYmd = (group.driver_documents_retain_until as string | null) ?? null;
  const driverDocumentsRetainUntilLabel = retainUntilYmd ? formatUkDate(retainUntilYmd) : null;
  const driverDocumentsRetentionWarning =
    !options.driverUserId && retainUntilYmd
      ? getDriverDocumentsRetentionWarning(retainUntilYmd, ukTodayYmd())?.message ?? null
      : null;

  const checkinCompleted = await loadHireCheckinCompleted(supabase, hireGroupId);
  const canFinalizeSettlement = canFinalizeHireSettlement({
    contractEnded: Boolean(contractEndedYmd),
    checkinCompleted,
  });

  const { data: schedule, error: schedErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, expected_payment_account_id, vehicle_hire_schedule_discounts(id, amount_gbp, reason)",
    )
    .eq("hire_group_id", hireGroupId)
    .order("sort_order", { ascending: true });
  if (schedErr) return { ok: false, error: "Could not load hire payments." };

  const dbRows = (schedule ?? []) as DbScheduleRow[];
  const today = ukTodayYmd();
  const accrualYmd = contractEndedYmd ?? today;
  const eventStateByRow = await loadPaymentRowEventState(
    supabase,
    dbRows.map((row) => row.id),
  );

  const inputs = dbRows.map((row) => mapDbRow(row, eventStateByRow, accrualYmd));
  let enriched = enrichHirePaymentRows(inputs, accrualYmd);
  let summary = summarizeHirePayments(inputs, accrualYmd);

  if (contractEndedYmd) {
    enriched = filterPaymentScheduleForEndedContract(enriched, contractEndedYmd);
    summary = summarizeHirePayments(enriched, accrualYmd);
    summary = { ...summary, nextDue: null, nextFutureDue: null };

    const rawTerminationSummary = group.termination_settlement as HireTerminationAccountsSummary | null;
    const terminationSummaryForReconcile =
      rawTerminationSummary && typeof rawTerminationSummary === "object" ? rawTerminationSummary : null;
    const depositDispositionForReconcile = (group.deposit_disposition as string | null) ?? null;
    if (terminationSummaryForReconcile && depositDispositionForReconcile) {
      const reconciled = reconcileEndedHirePaymentsWithDepositCredit({
        rows: enriched,
        summary,
        disposition: depositDispositionForReconcile,
        terminationSummary: {
          depositGbp: terminationSummaryForReconcile.depositGbp,
          signedRentBalanceGbp: terminationSummaryForReconcile.signedRentBalanceGbp,
          accruedRentPaidGbp: terminationSummaryForReconcile.accruedRentPaidGbp,
        },
        depositRefundAmountGbp:
          group.deposit_refund_amount_gbp != null ? Number(group.deposit_refund_amount_gbp) : null,
        accrualYmd,
      });
      enriched = reconciled.rows;
      summary = reconciled.summary;
    }

    if (terminationSummaryForReconcile) {
      enriched = adjustEndedContractPaymentRowDues(
        enriched,
        contractEndedYmd,
        terminationSummaryForReconcile.rentBillingMode ?? "end_of_period",
        terminationSummaryForReconcile.rentCadence ?? "weekly",
      );
      const adjustedInputs: HirePaymentScheduleRowInput[] = enriched.map((row) => ({
        id: row.id,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        rowKind: row.rowKind,
        baseAmountGbp: row.baseAmountGbp,
        discountTotalGbp: row.discountTotalGbp,
        paymentStatus: row.paymentStatus,
        approvedAmountGbp: row.paidGbp,
        pendingSubmittedGbp: row.pendingSubmittedGbp,
        sortOrder: row.sortOrder,
      }));
      summary = summarizeHirePayments(adjustedInputs, accrualYmd);
    }
  }

  const hasPostEndPrepaidPayments = contractEndedYmd
    ? hasPostEndPrepaidRows(enriched, contractEndedYmd)
    : false;

  const depositReceivedGbp = roundGbpSum(
    enriched.filter((row) => row.rowKind === "deposit").map((row) => row.paidGbp),
  );

  const accountId =
    dbRows.find((r) => r.expected_payment_account_id)?.expected_payment_account_id ??
    (group.default_payment_account_id as string | null);
  const paymentAccount = await loadPaymentAccount(
    supabase,
    accountId,
    (group.parent_company_id as string | null) ?? null,
  );

  const vehicle = group.vehicles as { vrm?: string } | null;
  const driverLabel =
    (group.driver_email as string | null)?.trim() ||
    (group.driver_licence_number as string | null)?.trim() ||
    null;

  let canApprovePayments = false;
  let canSubmitPayment = Boolean(options.driverUserId) && !contractEndedYmd;
  let canApplyDiscount = false;
  let canRecordSettlementPayment = false;
  let canResolveDeposit = false;
  let canMutateExtraCharges = false;
  let settlementPaymentAccounts: HireBalancePaymentAccountOption[] = [];
  let defaultSettlementPaymentAccountId: string | null = null;

  const { data: balancePayments } = await supabase
    .from("vehicle_hire_balance_payments")
    .select(
      "id, amount_gbp, direction, payment_method, payment_reference, payment_account_id, paid_at, payment_category",
    )
    .eq("hire_group_id", hireGroupId)
    .order("paid_at", { ascending: false });

  const { data: chargeRows } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .select(
      "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at",
    )
    .eq("hire_group_id", hireGroupId)
    .order("created_at", { ascending: false });

  const { data: extraChargePaymentEvents } = await supabase
    .from("vehicle_hire_group_events")
    .select("event_type, created_at, metadata, summary")
    .eq("hire_group_id", hireGroupId)
    .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
    .order("created_at", { ascending: true });

  const mappedCharges = mapDriverChargeLineItemsFromDb(
    (chargeRows ?? []) as DriverChargeLineItemDbRow[],
  );
  const driverChargeTimedPayments = (balancePayments ?? [])
    .filter(
      (payment) =>
        (payment.payment_category as string | null) === "driver_charge" &&
        (payment.direction as string | null) === "received_from_driver",
    )
    .map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
    }))
    .filter((payment) => payment.id && payment.paidAt && payment.amountGbp > 0);
  const extraChargeAllocationEvents = (extraChargePaymentEvents ?? []).map((event) => ({
    eventType: String(event.event_type ?? ""),
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }));
  const extraChargesOutstandingGbp = driverChargeTimedPayments.length
    ? outstandingExtraChargesFromTimedPaymentsGbp({
        charges: mappedCharges,
        payments: driverChargeTimedPayments,
        allocationEvents: extraChargeAllocationEvents,
      })
    : outstandingExtraChargesGbp(
        mappedCharges,
        (balancePayments ?? []).map((payment) => ({
          amountGbp: Number(payment.amount_gbp ?? 0),
          direction: (payment.direction as string | null) ?? null,
          paymentCategory: (payment.payment_category as string | null) ?? "settlement",
        })),
      );
  const extraChargePendingPayment = resolveOpenExtraChargePayment(
    (extraChargePaymentEvents ?? []).map((event) => ({
      eventType: String(event.event_type ?? ""),
      createdAt: event.created_at as string,
      metadata: (event.metadata as Record<string, unknown> | null) ?? {},
      summary: (event.summary as string | null) ?? null,
    })),
  );

  const settlementBalance = computeHireWorkspaceSettlementBalance({
    settlementBalanceDirection: (group.settlement_balance_direction as string | null) ?? null,
    settlementBalanceGbp: Number(group.settlement_balance_gbp ?? 0),
    balancePayments: (balancePayments ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: payment.direction as "received_from_driver" | "paid_to_driver",
    })),
  });

  const settlementDirection = (group.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null) ?? "settled";
  const currentSignedSettlementGbp =
    settlementDirection === "settled"
      ? 0
      : signedSettlementBalanceGbp(
          settlementDirection,
          Number(group.settlement_balance_gbp ?? 0),
        );

  const settlementPaymentAccountIds = new Set<string>();
  for (const payment of balancePayments ?? []) {
    const accountId = payment.payment_account_id as string | null;
    if (accountId) settlementPaymentAccountIds.add(accountId);
  }
  const settlementAccountNameById = new Map<string, string>();
  if (settlementPaymentAccountIds.size) {
    const { data: settlementAccounts } = await supabase
      .from("company_payment_accounts")
      .select("id, name")
      .in("id", [...settlementPaymentAccountIds]);
    for (const account of settlementAccounts ?? []) {
      settlementAccountNameById.set(
        account.id as string,
        (account.name as string)?.trim() || "Account",
      );
    }
  }
  const settlementBalancePayments: Array<
    HireBalancePaymentRow & { direction: "received_from_driver" | "paid_to_driver" }
  > = (balancePayments ?? []).map(
    (payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paymentMethod: payment.payment_method as string,
      paymentReference: (payment.payment_reference as string | null) ?? null,
      paymentAccountId: (payment.payment_account_id as string | null) ?? null,
      paymentAccountName: payment.payment_account_id
        ? settlementAccountNameById.get(payment.payment_account_id as string) ?? null
        : null,
      notes: null,
      paidAt: payment.paid_at as string,
      direction: payment.direction as "received_from_driver" | "paid_to_driver",
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    }),
  );

  if (staffProfile) {
    const profile = staffProfile;
    canApprovePayments = can(profile, "billing.pay") && !contractEndedYmd;
    canSubmitPayment = can(profile, "rentals.write") && !contractEndedYmd;
    canApplyDiscount = can(profile, "rentals.write") && !contractEndedYmd;
    canMutateExtraCharges =
      can(profile, "rentals.write") && !contractEndedYmd && isHirePaymentsWorkspaceOpen(hireStatus);

    canResolveDeposit =
      canFinalizeSettlement &&
      isDepositDispositionPending((group.deposit_disposition as string | null) ?? null) &&
      depositReceivedGbp > 0.005 &&
      can(profile, "rentals.write");

    defaultSettlementPaymentAccountId = (group.default_payment_account_id as string | null) ?? null;
    if (can(profile, "rentals.write")) {
      const companyId = group.parent_company_id as string;
      const { data: accounts } = await supabase
        .from("company_payment_accounts")
        .select("id, name")
        .eq("parent_company_id", companyId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      settlementPaymentAccounts = (accounts ?? []).map((account) => ({
        id: account.id as string,
        name: (account.name as string)?.trim() || "Account",
        isDefault: (account.id as string) === defaultSettlementPaymentAccountId,
      }));
    }

    if (
      settlementBalance &&
      !settlementBalance.settled &&
      settlementBalance.openBalanceGbp > 0.005 &&
      canFinalizeSettlement
    ) {
      canRecordSettlementPayment = can(profile, "rentals.write");
    }
  }

  const rows: HirePaymentPageRow[] = enriched.map((row) => {
    const dbRow = dbRows.find((r) => r.id === row.id);
    const discountRows = (dbRow?.vehicle_hire_schedule_discounts ?? []) as {
      id: string;
      amount_gbp: number;
      reason: string;
    }[];
    return {
      ...row,
      periodLabel:
        row.rowKind === "deposit"
          ? "Deposit"
          : formatUkDateRange(row.periodStart, row.periodEnd),
      discounts: discountRows.map((d) => ({
        id: d.id,
        amountGbp: Number(d.amount_gbp),
        reason: d.reason,
      })),
    };
  });

  const rawTerminationSummary = group.termination_settlement as HireTerminationAccountsSummary | null;
  const terminationSummary =
    contractEndedYmd && rawTerminationSummary && typeof rawTerminationSummary === "object"
      ? rawTerminationSummary
      : null;
  const depositDisposition = (group.deposit_disposition as string | null) ?? null;
  const depositHeldGbp = hireDepositHeldGbp({
    depositDisposition,
    depositReceivedGbp,
  });
  const depositPendingReview =
    isDepositDispositionPending(depositDisposition) && depositHeldGbp > 0.005;
  const settlementResolution = (group.settlement_resolution as string | null) ?? null;

  const pendingReviewCharges: HireEndedPendingChargeReview[] = [];
  if (contractEndedYmd && !options.driverUserId) {
    const { data: checkinInspection } = await supabase
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", hireGroupId)
      .eq("kind", "checkin")
      .eq("status", "completed")
      .maybeSingle();
    if (checkinInspection?.id) {
      const { data: pendingDamages } = await supabase
        .from("vehicle_hire_inspection_damages")
        .select("id, panel_id, damage_type, severity, notes, charge_gbp, charge_resolution")
        .eq("inspection_id", checkinInspection.id as string)
        .eq("charge_resolution", "review_later");
      for (const damage of pendingDamages ?? []) {
        const panel = String(damage.panel_id ?? "").trim();
        const damageType = String(damage.damage_type ?? "").trim();
        const label = [panel, damageType].filter(Boolean).join(" · ") || "Return damage";
        const severity = String(damage.severity ?? "").trim();
        const notes = String(damage.notes ?? "").trim();
        const detail = [severity ? `${severity} damage` : null, notes || null].filter(Boolean).join(" · ") || null;
        const proposed =
          damage.charge_gbp != null && Number.isFinite(Number(damage.charge_gbp))
            ? Math.max(0, Number(damage.charge_gbp))
            : null;
        pendingReviewCharges.push({
          id: String(damage.id),
          kind: "damage",
          label,
          detail,
          proposedGbp: proposed,
          evidenceHref: `/rental/hires/${hireGroupId}/checkin`,
        });
      }
    }

    const endHireDraft = parseHireEndHireDraft(group.end_hire_draft);
    const pendingFlags = endHireDraft?.pendingReturnReviews ?? null;
    const draft = endHireDraft?.returnChargesDraft ?? null;
    if (pendingFlags?.fuel) {
      const fuelGbp =
        draft?.fuel?.enabled && draft.fuel.amountGbp != null
          ? Math.max(0, Number(draft.fuel.amountGbp) || 0)
          : null;
      pendingReviewCharges.push({
        id: "fuel-review",
        kind: "fuel",
        label: "Fuel shortfall",
        detail: "Awaiting return fuel decision",
        proposedGbp: fuelGbp != null && fuelGbp > 0.005 ? fuelGbp : null,
        evidenceHref: `/rental/hires/${hireGroupId}/checkin`,
      });
    }
    for (const key of pendingFlags?.accessories ?? []) {
      const accessoryDraft = draft?.accessories?.find((item) => item.key === key);
      const amount =
        accessoryDraft?.amountGbp != null ? Math.max(0, Number(accessoryDraft.amountGbp) || 0) : null;
      pendingReviewCharges.push({
        id: `accessory-${key}`,
        kind: "accessory",
        label: `Missing accessory · ${key}`,
        detail: "Awaiting accessory charge decision",
        proposedGbp: amount != null && amount > 0.005 ? amount : null,
        evidenceHref: `/rental/hires/${hireGroupId}/checkin`,
      });
    }
  }

  const pendingReviews: HireEndedPendingReviewsSummary = {
    depositPending: depositPendingReview,
    depositHeldGbp: depositHeldGbp > 0.005 ? depositHeldGbp : 0,
    charges: pendingReviewCharges,
  };

  const settlementPaymentsToDriverGbp = roundGbpSum(
    (balancePayments ?? [])
      .filter((payment) => payment.direction === "paid_to_driver")
      .map((payment) => Number(payment.amount_gbp ?? 0)),
  );
  const settlementPaymentsFromDriverGbp = roundGbpSum(
    (balancePayments ?? [])
      .filter((payment) => payment.direction === "received_from_driver")
      .map((payment) => Number(payment.amount_gbp ?? 0)),
  );
  const driverChargesOnBalanceGbp = roundGbpSum(
    mappedCharges
      .filter((item) => item.resolution === "add_to_balance")
      .map((item) => item.amountGbp),
  );
  const audience = options.driverUserId ? ("driver" as const) : ("staff" as const);
  const settlementBreakdown =
    settlementBalance && terminationSummary
      ? buildHireSettlementBreakdown({
          terminationSummary,
          openBalanceGbp: settlementBalance.openBalanceGbp,
          openDirection: settlementBalance.settlementDirection,
          driverChargesGbp: driverChargesOnBalanceGbp,
          extraCharges: mappedCharges.map((item) => ({
            id: item.id,
            chargeType: item.chargeType,
            description: item.description ?? null,
            amountGbp: item.amountGbp,
            resolution: item.resolution,
          })),
          settlementPaymentsToDriverGbp,
          settlementPaymentsFromDriverGbp,
          depositDisposition,
          depositReceivedGbp,
          audience,
        })
      : null;

  const accountPosition =
    contractEndedYmd && terminationSummary
      ? (() => {
          const extrasPostedGbp = roundGbpSum(
            mappedCharges
              .filter(
                (item) =>
                  item.resolution === "add_to_balance" || item.resolution === "paid_now",
              )
              .map((item) => item.amountGbp),
          );
          return buildEndedHireAccountPosition({
            terminationSummary,
            depositDisposition,
            depositReceivedGbp,
            extraChargesOutstandingGbp,
            extraChargesPostedGbp: extrasPostedGbp,
            extraChargePaymentsConfirmedGbp: roundGbpSum([
              Math.max(0, extrasPostedGbp - extraChargesOutstandingGbp),
            ]),
            refundPaidGbp: settlementPaymentsToDriverGbp,
            settlementReceivedFromDriverGbp: settlementPaymentsFromDriverGbp,
            lifecycle: settlementBalance?.settled ? "completed" : "ended",
          });
        })()
      : buildActiveHireAccountPosition({
          depositRequiredGbp: (() => {
            const depositRow = enriched.find((row) => row.rowKind === "deposit");
            return depositRow ? Number(depositRow.netDueGbp ?? 0) : 0;
          })(),
          depositReceivedGbp,
          rentChargedAfterDiscountGbp: summary.totalDueGbp,
          rentPaidConfirmedGbp: summary.totalPaidGbp,
          extraChargesOutstandingGbp,
        });

  return {
    ok: true,
    data: {
      hireGroupId,
      vehicleVrm: vehicle?.vrm?.trim() || "—",
      driverLabel,
      hireStatus,
      contractEndedYmd,
      contractEndedAtLabel,
      driverDocumentsRetainUntilLabel,
      driverDocumentsRetentionWarning,
      scheduleShowsEndedContractOnly: Boolean(contractEndedYmd),
      hasPostEndPrepaidPayments,
      scheduleReadOnly: Boolean(contractEndedYmd),
      settlementBalance,
      canRecordSettlementPayment,
      settlementPaymentAccounts,
      defaultSettlementPaymentAccountId,
      settlementBalancePayments,
      terminationSummary,
      depositDispositionLabel: depositDisposition
        ? hireDepositDispositionLabel(depositDisposition as HireDepositDisposition, audience)
        : null,
      depositDisposition,
      depositPendingReview,
      /** Amount currently held pending disposition (received cash), not contractual requirement. */
      depositGbp: depositHeldGbp > 0.005 ? depositHeldGbp : null,
      depositReceivedGbp,
      accountPosition,
      currentSignedSettlementGbp,
      checkinCompleted,
      canFinalizeSettlement,
      canResolveDeposit: canResolveDeposit && depositHeldGbp > 0.005,
      settlementResolutionLabel:
        settlementResolution &&
        (["paid_now", "open_balance", "written_off"] as const).includes(
          settlementResolution as HireSettlementResolution,
        )
          ? settlementResolutionLabel(settlementResolution as HireSettlementResolution, audience)
          : null,
      settlementBreakdown,
      driverChargeLineItems: mappedCharges.map((item) =>
        toHireDriverChargeWorkspaceView(item, { allowMutate: canMutateExtraCharges }),
      ),
      extraChargesOutstandingGbp,
      extraChargePendingPayment: extraChargePendingPayment
        ? {
            submissionId: extraChargePendingPayment.submissionId,
            amountGbp: extraChargePendingPayment.amountGbp,
            paymentReference: extraChargePendingPayment.paymentReference,
            allocations: extraChargePendingPayment.allocations?.map((line) => ({
              chargeLineItemId: line.chargeLineItemId,
              amountGbp: line.amountGbp,
              ...(line.label ? { label: line.label } : {}),
            })),
          }
        : null,
      extraChargeAllocationEvents,
      extraChargeTimedPayments: driverChargeTimedPayments,
      canMutateExtraCharges,
      summary,
      rows,
      paymentAccount,
      canSubmitPayment,
      canApprovePayments,
      canApplyDiscount,
      pendingReviews,
    },
  };
}

export async function loadHirePaymentsPageAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  return buildPaymentsPageData(hireGroupId.trim(), {});
}

export async function loadDriverHirePaymentsPageAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return buildPaymentsPageData(hireGroupId.trim(), { driverUserId: user.id });
}

type SubmitPaymentInput = {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
  paymentMethod?: string | null;
  paymentAccountId?: string | null;
  paidOnYmd?: string | null;
  notes?: string | null;
  /** When set, allocate only to deposit or rent rows. */
  scheduleTarget?: "deposit" | "rent" | null;
  actor: "driver" | "company_staff";
  userId: string;
};

async function submitHirePaymentAllocation(input: SubmitPaymentInput): Promise<
  { ok: true; submissionId: string } | { ok: false; error: string }
> {
  const hireGroupId = input.hireGroupId.trim();
  if (!hireGroupId) return { ok: false, error: "Hire not found." };

  const amount = Math.round(input.amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid payment amount." };

  const page = await buildPaymentsPageData(
    hireGroupId,
    input.actor === "driver" ? { driverUserId: input.userId } : {},
  );
  if (!page.ok) return page;

  let staffPaymentDetails: {
    paymentMethod: string;
    paymentAccountId: string | null;
    paymentAccountName: string | null;
    paidOnYmd: string;
    notes: string | null;
  } | null = null;

  if (input.actor === "company_staff") {
    const { profile } = await requireRentalCompanyArea();
    if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };
    const method = (input.paymentMethod ?? "").trim();
    if (!(HIRE_DEPOSIT_REFUND_METHODS as readonly string[]).includes(method)) {
      return { ok: false, error: "Select a payment method." };
    }
    const paidOnYmd = parseStaffManualChargeDateYmd(input.paidOnYmd ?? "");
    if (!paidOnYmd) return { ok: false, error: "Enter a valid payment date." };
    const accountRequired = settlementPaymentMethodRequiresAccount(method);
    const paymentAccountId = input.paymentAccountId?.trim() || null;
    if (accountRequired && !paymentAccountId) {
      return { ok: false, error: "Select the payment account this money was paid into." };
    }
    if (accountRequired && paymentAccountId) {
      const companyId = profile.company_id?.trim();
      if (!companyId) return { ok: false, error: "No active company." };
      const supabaseAccounts = await createClient();
      const { data: account } = await supabaseAccounts
        .from("company_payment_accounts")
        .select("id, name")
        .eq("id", paymentAccountId)
        .eq("parent_company_id", companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (!account?.id) return { ok: false, error: "Payment account not found." };
      staffPaymentDetails = {
        paymentMethod: method,
        paymentAccountId,
        paymentAccountName: (account.name as string | null)?.trim() || "Account",
        paidOnYmd,
        notes: input.notes?.trim() || null,
      };
    } else {
      staffPaymentDetails = {
        paymentMethod: method,
        paymentAccountId: null,
        paymentAccountName: null,
        paidOnYmd,
        notes: input.notes?.trim() || null,
      };
    }
  }

  const inputs: HirePaymentScheduleRowInput[] = page.data.rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: row.sortOrder,
  }));

  const scheduleTarget =
    input.scheduleTarget === "deposit" || input.scheduleTarget === "rent" ? input.scheduleTarget : null;
  const depositStillDue = page.data.rows.some(
    (row) =>
      row.rowKind === "deposit" &&
      row.balanceGbp > 0.005 &&
      row.paymentStatus !== "pending_approval",
  );

  if (scheduleTarget === "deposit" && !depositStillDue) {
    return { ok: false, error: "The deposit is already paid in full." };
  }
  if (scheduleTarget == null && depositStillDue) {
    return { ok: false, error: "Choose whether this payment counts towards the deposit or rent." };
  }

  const allocation = allocatePaymentAcrossRows(amount, inputs, ukTodayYmd(), {
    ...(scheduleTarget ? { rowKind: scheduleTarget } : {}),
    ...(scheduleTarget === "deposit" ? { overflowRemainderToRent: true } : {}),
  });
  if (!allocation.allocations.length) {
    return {
      ok: false,
      error:
        scheduleTarget === "deposit"
          ? "No outstanding deposit or rent balance to allocate this payment to."
          : scheduleTarget === "rent"
            ? "No outstanding rent balance to allocate this payment to."
            : "No outstanding balance on the payment schedule to allocate this payment to.",
    };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, driver_user_id, driver_email, driver_licence_number, vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const submissionId = randomUUID();
  const actorRole = input.actor === "driver" ? "driver" : "company_staff";

  let scheduleWriter = supabase;
  if (input.actor === "driver") {
    try {
      scheduleWriter = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server error." };
    }
  }

  const allocationRowIds = allocation.allocations.map((line) => line.rowId);
  const statusReader = input.actor === "driver" ? scheduleWriter : supabase;
  const submitEventState = await loadPaymentRowEventState(statusReader, allocationRowIds);
  const today = ukTodayYmd();
  const { data: storedRows, error: storedRowsErr } = await statusReader
    .from("vehicle_hire_payment_schedule")
    .select("id, payment_status")
    .in("id", allocationRowIds);
  if (storedRowsErr) return { ok: false, error: storedRowsErr.message };

  for (const line of allocation.allocations) {
    const row = page.data.rows.find((r) => r.id === line.rowId);
    if (!row) continue;

    const storedStatus = (storedRows?.find((r) => r.id === line.rowId)?.payment_status ??
      row.paymentStatus) as HirePaymentStatus;
    const workflowFromStatus = resolveHirePaymentWorkflowStatus(
      storedStatus,
      submitEventState.get(line.rowId)?.latestToStatus ?? null,
      { periodStartYmd: row.periodStart, todayYmd: today },
    );
    const toStatus: HirePaymentStatus =
      input.actor === "company_staff" ? "approved" : "pending_approval";

    if (input.actor === "driver") {
      if (workflowFromStatus === "pending_approval") {
        return { ok: false, error: "A payment is already pending approval for one or more periods." };
      }
      if (
        !canTransitionPaymentStatus({
          from: workflowFromStatus,
          to: "pending_approval",
          actor: "driver",
        })
      ) {
        return { ok: false, error: `Cannot apply payment to row ${row.periodLabel}.` };
      }
    } else if (
      !canStaffRecordPaymentAllocation({
        workflowStatus: workflowFromStatus,
        rowBalanceGbp: row.balanceGbp,
      })
    ) {
      return { ok: false, error: `Cannot record payment on row ${row.periodLabel}.` };
    }

    const { data: statusEvent, error: eventErr } = await supabase
      .from("vehicle_hire_payment_status_events")
      .insert({
      schedule_row_id: line.rowId,
      event_kind: "status_change",
      from_status: workflowFromStatus,
      to_status: toStatus,
      comment: input.paymentReference?.trim() || null,
      amendment_payload: {
        submissionId,
        submittedAmountGbp: line.allocatedGbp,
        paymentReference: input.paymentReference?.trim() || null,
        ...(staffPaymentDetails
          ? {
              paymentMethod: staffPaymentDetails.paymentMethod,
              paymentAccountId: staffPaymentDetails.paymentAccountId,
              paymentAccountName: staffPaymentDetails.paymentAccountName,
              paidOnYmd: staffPaymentDetails.paidOnYmd,
              notes: staffPaymentDetails.notes,
            }
          : {}),
      },
      actor_user_id: input.userId,
      actor_role: actorRole,
    })
      .select("id")
      .maybeSingle();
    if (eventErr) return { ok: false, error: eventErr.message };

    const updatePayload: Record<string, unknown> = {
      payment_status: toStatus,
    };
    if (toStatus === "approved") {
      const priorPaid = row.paidGbp;
      updatePayload.approved_amount_gbp = Math.round((priorPaid + line.allocatedGbp) * 100) / 100;
    }

    const { data: updatedRow, error: updErr } = await scheduleWriter
      .from("vehicle_hire_payment_schedule")
      .update(updatePayload)
      .eq("id", line.rowId)
      .select("id")
      .maybeSingle();
    if (updErr) return { ok: false, error: updErr.message };
    if (!updatedRow) {
      return { ok: false, error: "Could not update the payment schedule. Please try again." };
    }

    await logSchedulePaymentGroupActivity({
      hireGroupId,
      eventType:
        input.actor === "driver" ? "schedule_payment_submitted" : "schedule_payment_recorded",
      summary:
        input.actor === "driver"
          ? `Submitted £${line.allocatedGbp.toFixed(2)} for ${row.periodLabel}.`
          : `Recorded £${line.allocatedGbp.toFixed(2)} for ${row.periodLabel}.`,
      actorRole: actorRole,
      actorUserId: input.userId,
      metadata: {
        scheduleRowId: line.rowId,
        rowKind: row.rowKind,
        amountGbp: line.allocatedGbp,
        submissionId,
        scheduleTarget,
        paymentStatusEventId: (statusEvent?.id as string | undefined) ?? null,
      },
    });
  }

  // Staff recording payment skips inbox; drivers notify finance.
  if (input.actor === "driver") {
    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server error." };
    }

    const vehicle = group.vehicles as { vrm?: string } | null;
    const driverLabel =
      (group.driver_email as string | null)?.trim() ||
      (group.driver_licence_number as string | null)?.trim() ||
      "Driver";

    await notifyCompanyHirePaymentReviewers(admin, group.parent_company_id as string, "hire_payment_submitted", {
      hireGroupId,
      submissionId,
      vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
      driverLabel,
      amountGbp: amount,
      allocatedPeriods: allocation.allocations.map((a) => ({
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        amountGbp: a.allocatedGbp,
      })),
      href: `/rental/hires/${hireGroupId}/payments?submission=${submissionId}`,
    });
  }

  await refreshVehicleFinancialsForHire(hireGroupId);
  return { ok: true, submissionId };
}

async function assertHirePaymentScheduleEditable(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Hire not found." };
  const status = String(data.status ?? "");
  if (status === "terminated" || status === "completed") {
    return { ok: false, error: "This contract has ended. The payment schedule is read-only." };
  }
  return { ok: true };
}


function scheduleActivityRowLabel(input: {
  rowKind?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
}): string {
  if (input.periodLabel?.trim()) return input.periodLabel.trim();
  if ((input.rowKind ?? "") === "deposit") return "Deposit";
  const start = (input.periodStart ?? "").trim();
  const end = (input.periodEnd ?? "").trim();
  if (start && end && start !== end) return formatUkDateRange(start, end);
  if (start) return formatUkDate(start);
  return "Rent period";
}

async function logSchedulePaymentGroupActivity(input: {
  hireGroupId: string;
  eventType: HireGroupEventType;
  summary: string;
  actorRole: "company_staff" | "driver";
  actorUserId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await logHireGroupEvent(admin, {
      hireGroupId: input.hireGroupId,
      eventType: input.eventType,
      summary: input.summary,
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("logSchedulePaymentGroupActivity", input.eventType, error);
  }
}

async function refreshVehicleFinancialsForHire(hireGroupId: string): Promise<void> {
  try {
    await revalidateVehicleFinancialsForHireGroup(hireGroupId);
  } catch (error) {
    console.error("refreshVehicleFinancialsForHire", error);
  }
}

export async function submitDriverHirePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
  scheduleTarget?: "deposit" | "rent" | null;
}): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return submitHirePaymentAllocation({
    hireGroupId: input.hireGroupId,
    amountGbp: input.amountGbp,
    paymentReference: input.paymentReference,
    scheduleTarget: input.scheduleTarget,
    actor: "driver",
    userId: user.id,
  });
}

export async function submitStaffHirePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
  paymentMethod: string;
  paymentAccountId?: string | null;
  paidOnYmd: string;
  notes?: string | null;
  scheduleTarget?: "deposit" | "rent" | null;
}): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  const editable = await assertHirePaymentScheduleEditable(input.hireGroupId);
  if (!editable.ok) return editable;
  return submitHirePaymentAllocation({
    hireGroupId: input.hireGroupId,
    amountGbp: input.amountGbp,
    paymentReference: input.paymentReference,
    paymentMethod: input.paymentMethod,
    paymentAccountId: input.paymentAccountId,
    paidOnYmd: input.paidOnYmd,
    notes: input.notes,
    scheduleTarget: input.scheduleTarget,
    actor: "company_staff",
    userId: user.id,
  });
}

/** Mark a single schedule row as paid (staff only, immediate approval). */
export async function recordStaffHirePaymentRowAction(
  scheduleRowId: string,
  paymentReference?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: scheduleRow, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, row_kind, period_start, period_end, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", scheduleRowId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!scheduleRow) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(scheduleRow.hire_group_id as string);
  if (!editable.ok) return editable;

  const page = await buildPaymentsPageData(scheduleRow.hire_group_id as string, {});
  if (!page.ok) return page;

  const row = page.data.rows.find((r) => r.id === scheduleRowId);
  if (!row) return { ok: false, error: "Payment row not found." };
  if (row.balanceGbp <= 0) return { ok: false, error: "This row has no outstanding balance." };
  if (row.paymentStatus === "pending_approval") {
    return { ok: false, error: "A payment is already pending approval for this row." };
  }
  if (row.paymentStatus !== "not_received" && row.paymentStatus !== "rejected") {
    return { ok: false, error: "This row cannot be marked paid directly." };
  }

  const fromStatus = row.paymentStatus;
  const approvedAmount = Math.round((row.paidGbp + row.balanceGbp) * 100) / 100;

  const { data: statusEvent, error: eventErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .insert({
    schedule_row_id: scheduleRowId,
    event_kind: "status_change",
    from_status: fromStatus,
    to_status: "approved",
    comment: paymentReference?.trim() || null,
    amendment_payload: {
      submittedAmountGbp: row.balanceGbp,
      paymentReference: paymentReference?.trim() || null,
      directRowPayment: true,
    },
    actor_user_id: user.id,
    actor_role: "company_staff",
  })
    .select("id")
    .maybeSingle();
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: "approved", approved_amount_gbp: approvedAmount })
    .eq("id", scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  await logSchedulePaymentGroupActivity({
    hireGroupId: scheduleRow.hire_group_id as string,
    eventType: "schedule_payment_recorded",
    summary: `Recorded £${Number(row.balanceGbp).toFixed(2)} for ${row.periodLabel}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      scheduleRowId,
      rowKind: row.rowKind,
      amountGbp: row.balanceGbp,
      directRowPayment: true,
      paymentStatusEventId: (statusEvent?.id as string | undefined) ?? null,
    },
  });

  await refreshVehicleFinancialsForHire(scheduleRow.hire_group_id as string);
  return { ok: true };
}

export async function approveHirePaymentRowAction(
  scheduleRowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, row_kind, period_start, period_end, payment_status, approved_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp), base_amount_gbp",
    )
    .eq("id", scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(row.hire_group_id as string);
  if (!editable.ok) return editable;

  const fromStatus = row.payment_status as HirePaymentStatus;
  const eventState = await loadPaymentRowEventState(supabase, [scheduleRowId]);
  const state = eventState.get(scheduleRowId);
  const workflowFromStatus = resolveHirePaymentWorkflowStatus(
    fromStatus,
    state?.latestToStatus ?? null,
  );
  const submitted =
    workflowFromStatus === "pending_approval" ? (state?.pendingSubmittedGbp ?? null) : null;
  if (
    !canTransitionPaymentStatus({ from: workflowFromStatus, to: "approved", actor: "company_staff" })
  ) {
    return { ok: false, error: "This payment cannot be approved." };
  }

  if (submitted == null) return { ok: false, error: "No submitted amount found for this row." };

  const priorApproved = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : 0;
  const approvedAmount = Math.round((priorApproved + submitted) * 100) / 100;

  const { data: statusEvent, error: eventErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .insert({
    schedule_row_id: scheduleRowId,
    event_kind: "status_change",
    from_status: workflowFromStatus,
    to_status: "approved",
    amendment_payload: { approvedAmountGbp: approvedAmount },
    actor_user_id: user.id,
    actor_role: "company_staff",
  })
    .select("id")
    .maybeSingle();
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: "approved", approved_amount_gbp: approvedAmount })
    .eq("id", scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  const approveLabel = scheduleActivityRowLabel({
    rowKind: row.row_kind as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
  });
  await logSchedulePaymentGroupActivity({
    hireGroupId: row.hire_group_id as string,
    eventType: "schedule_payment_approved",
    summary: `Approved £${Number(submitted).toFixed(2)} for ${approveLabel}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      scheduleRowId,
      rowKind: row.row_kind,
      amountGbp: submitted,
      paymentStatusEventId: (statusEvent?.id as string | undefined) ?? null,
    },
  });

  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_approved", {
    amountGbp: submitted,
  });

  await refreshVehicleFinancialsForHire(row.hire_group_id as string);
  return { ok: true };
}

export async function rejectHirePaymentRowAction(input: {
  scheduleRowId: string;
  comment: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const comment = input.comment.trim();
  if (!comment) return { ok: false, error: "A reason is required when rejecting a payment." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select("id, hire_group_id, row_kind, period_start, period_end, payment_status")
    .eq("id", input.scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(row.hire_group_id as string);
  if (!editable.ok) return editable;

  const today = ukTodayYmd();
  const fromStatus = row.payment_status as HirePaymentStatus;
  const eventState = await loadPaymentRowEventState(supabase, [input.scheduleRowId]);
  const state = eventState.get(input.scheduleRowId);
  const workflowFromStatus = resolveHirePaymentWorkflowStatus(
    fromStatus,
    state?.latestToStatus ?? null,
  );
  if (
    !canTransitionPaymentStatus({
      from: workflowFromStatus,
      to: "rejected",
      actor: "company_staff",
      comment,
    })
  ) {
    return { ok: false, error: "This payment cannot be rejected." };
  }

  const { data: statusEvent, error: eventErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .insert({
    schedule_row_id: input.scheduleRowId,
    event_kind: "status_change",
    from_status: workflowFromStatus,
    to_status: "rejected",
    comment,
    actor_user_id: user.id,
    actor_role: "company_staff",
  })
    .select("id")
    .maybeSingle();
  if (eventErr) return { ok: false, error: eventErr.message };

  const storedStatusAfterReject =
    (row.period_start as string) > today ? "not_received" : "rejected";
  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: storedStatusAfterReject })
    .eq("id", input.scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  const pendingAmount = state?.pendingSubmittedGbp;
  const rejectLabel = scheduleActivityRowLabel({
    rowKind: row.row_kind as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
  });
  await logSchedulePaymentGroupActivity({
    hireGroupId: row.hire_group_id as string,
    eventType: "schedule_payment_rejected",
    summary: comment.trim()
      ? `Rejected ${rejectLabel} payment: ${comment.trim()}`
      : `Rejected ${rejectLabel} payment.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      scheduleRowId: input.scheduleRowId,
      rowKind: row.row_kind,
      comment: comment.trim(),
      amountGbp: pendingAmount ?? null,
      paymentStatusEventId: (statusEvent?.id as string | undefined) ?? null,
    },
  });

  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_rejected", {
    amountGbp: pendingAmount ?? undefined,
    comment,
  });

  await refreshVehicleFinancialsForHire(row.hire_group_id as string);
  return { ok: true };
}

export async function amendApprovedHirePaymentRowAction(input: {
  scheduleRowId: string;
  approvedAmountGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required when amending an approved payment." };

  const newAmount = Math.round(input.approvedAmountGbp * 100) / 100;
  if (!Number.isFinite(newAmount) || newAmount < 0) {
    return { ok: false, error: "Enter a valid approved amount." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, row_kind, period_start, period_end, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", input.scheduleRowId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(row.hire_group_id as string);
  if (!editable.ok) return editable;

  const fromStatus = row.payment_status as HirePaymentStatus;
  if (fromStatus !== "approved") {
    return { ok: false, error: "Only approved payments can be amended." };
  }

  const nextStatus = nextStatusAfterApprovedAmountAmendment(newAmount);
  if (
    !canTransitionPaymentStatus({
      from: fromStatus,
      to: nextStatus,
      actor: "company_staff",
      comment: reason,
    })
  ) {
    return { ok: false, error: "This payment cannot be amended." };
  }

  const discounts = (row.vehicle_hire_schedule_discounts ?? []) as { amount_gbp: number }[];
  const discountTotal = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const netDue = Math.round((Number(row.base_amount_gbp) - discountTotal) * 100) / 100;
  if (newAmount > netDue) {
    return { ok: false, error: `Approved amount cannot exceed ${netDue.toFixed(2)} for this period.` };
  }

  const priorApproved = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : 0;
  if (Math.abs(newAmount - priorApproved) < 0.005 && nextStatus === fromStatus) {
    return { ok: false, error: "Enter a different approved amount to amend this row." };
  }

  const clearingApproval = nextStatus === "not_received";
  const { data: statusEvent, error: eventErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .insert({
    schedule_row_id: input.scheduleRowId,
    event_kind: clearingApproval ? "status_change" : "amendment",
    from_status: fromStatus,
    to_status: nextStatus,
    comment: reason,
    amendment_payload: {
      previousApprovedAmountGbp: priorApproved,
      newApprovedAmountGbp: newAmount,
    },
    actor_user_id: user.id,
    actor_role: "company_staff",
  })
    .select("id")
    .maybeSingle();
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update(
      clearingApproval
        ? { payment_status: nextStatus, approved_amount_gbp: null }
        : { approved_amount_gbp: newAmount },
    )
    .eq("id", input.scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  const amendLabel = scheduleActivityRowLabel({
    rowKind: row.row_kind as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
  });
  await logSchedulePaymentGroupActivity({
    hireGroupId: row.hire_group_id as string,
    eventType: "schedule_payment_amended",
    summary: `Amended ${amendLabel} payment from £${Number(priorApproved).toFixed(2)} to £${Number(newAmount).toFixed(2)}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      scheduleRowId: input.scheduleRowId,
      rowKind: row.row_kind,
      previousApprovedAmountGbp: priorApproved,
      newApprovedAmountGbp: newAmount,
      comment: reason,
      paymentStatusEventId: (statusEvent?.id as string | undefined) ?? null,
    },
  });

  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_amended", {
    amountGbp: newAmount,
    comment: reason,
    previousAmountGbp: priorApproved,
  });

  await refreshVehicleFinancialsForHire(row.hire_group_id as string);
  return { ok: true };
}

export async function previewHirePaymentAllocationAction(input: {
  hireGroupId: string;
  amountGbp: number;
  asDriver?: boolean;
}): Promise<
  | { ok: true; allocation: ReturnType<typeof allocatePaymentAcrossRows> }
  | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const page = await buildPaymentsPageData(
    input.hireGroupId.trim(),
    input.asDriver ? { driverUserId: user.id } : {},
  );
  if (!page.ok) return page;

  if (!input.asDriver) {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  }

  const inputs: HirePaymentScheduleRowInput[] = page.data.rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: row.sortOrder,
  }));

  return {
    ok: true,
    allocation: allocatePaymentAcrossRows(input.amountGbp, inputs, ukTodayYmd()),
  };
}

export async function applyHirePaymentDiscountAction(input: {
  scheduleRowId: string;
  amountGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };

  const scheduleRowId = input.scheduleRowId.trim();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required for the discount." };

  const amount = Math.round(input.amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid discount amount." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, row_kind, period_start, period_end, payment_status, base_amount_gbp, approved_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(row.hire_group_id as string);
  if (!editable.ok) return editable;

  if (String(row.row_kind ?? "") === "deposit") {
    return { ok: false, error: "Discounts cannot be applied to the deposit." };
  }

  const status = row.payment_status as HirePaymentStatus;
  if (status === "pending_approval") {
    return { ok: false, error: "Cannot apply a discount while a payment is pending approval." };
  }
  if (status === "approved") {
    return { ok: false, error: "This row is already fully paid." };
  }

  const discounts = (row.vehicle_hire_schedule_discounts ?? []) as { amount_gbp: number }[];
  const existingDiscount = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const base = Number(row.base_amount_gbp);
  const maxDiscount = Math.max(0, Math.round((base - existingDiscount) * 100) / 100);
  if (amount > maxDiscount) {
    return { ok: false, error: `Discount cannot exceed ${maxDiscount.toFixed(2)} on this row.` };
  }

  const { error: insertErr } = await supabase.from("vehicle_hire_schedule_discounts").insert({
    schedule_row_id: scheduleRowId,
    amount_gbp: amount,
    reason,
    applied_by_user_id: user.id,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  await refreshVehicleFinancialsForHire(row.hire_group_id as string);
  return { ok: true };
}

/**
 * Replace the total discount on a schedule row (amend), or remove it when amountGbp is 0 (cancel).
 * Existing discount rows are deleted and a single replacement row is inserted when amount > 0.
 */
export async function replaceHirePaymentDiscountAction(input: {
  scheduleRowId: string;
  amountGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };

  const scheduleRowId = input.scheduleRowId.trim();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required for the discount change." };

  const amount = Math.round(input.amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Enter a valid discount amount." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, row_kind, period_start, period_end, payment_status, base_amount_gbp, vehicle_hire_schedule_discounts(id, amount_gbp)",
    )
    .eq("id", scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const editable = await assertHirePaymentScheduleEditable(row.hire_group_id as string);
  if (!editable.ok) return editable;

  const page = await buildPaymentsPageData(row.hire_group_id as string, {});
  if (!page.ok) return page;

  if (String(row.row_kind ?? "") === "deposit") {
    return { ok: false, error: "Discounts cannot be applied to the deposit." };
  }

  const status = row.payment_status as HirePaymentStatus;
  if (status === "pending_approval") {
    return { ok: false, error: "Cannot change a discount while a payment is pending approval." };
  }
  if (status === "approved") {
    return { ok: false, error: "This row is already fully paid." };
  }

  const existing = (row.vehicle_hire_schedule_discounts ?? []) as { id: string; amount_gbp: number }[];
  const existingTotal = Math.round(existing.reduce((sum, d) => sum + Number(d.amount_gbp), 0) * 100) / 100;
  if (existingTotal <= 0.005 && amount <= 0.005) {
    return { ok: false, error: "This row has no discount to cancel." };
  }

  const base = Number(row.base_amount_gbp);
  if (amount > base + 0.005) {
    return { ok: false, error: `Discount cannot exceed ${base.toFixed(2)} on this row.` };
  }

  if (existing.length > 0) {
    const { error: deleteErr } = await supabase
      .from("vehicle_hire_schedule_discounts")
      .delete()
      .eq("schedule_row_id", scheduleRowId);
    if (deleteErr) return { ok: false, error: deleteErr.message };
  }

  if (amount > 0.005) {
    const { error: insertErr } = await supabase.from("vehicle_hire_schedule_discounts").insert({
      schedule_row_id: scheduleRowId,
      amount_gbp: amount,
      reason,
      applied_by_user_id: user.id,
    });
    if (insertErr) return { ok: false, error: insertErr.message };
  }

  const { data: discountStatusEvent, error: auditErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .insert({
    schedule_row_id: scheduleRowId,
    event_kind: "amendment",
    from_status: status,
    to_status: status,
    comment: reason,
    amendment_payload: {
      discountChange: true,
      previousDiscountGbp: existingTotal,
      newDiscountGbp: amount,
    },
    actor_user_id: user.id,
    actor_role: "company_staff",
  })
    .select("id")
    .maybeSingle();
  if (auditErr) return { ok: false, error: auditErr.message };

  const discountLabel = scheduleActivityRowLabel({
    rowKind: row.row_kind as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
  });
  await logSchedulePaymentGroupActivity({
    hireGroupId: row.hire_group_id as string,
    eventType: "schedule_discount_changed",
    summary: `Discount on ${discountLabel} changed from £${Number(existingTotal).toFixed(2)} to £${Number(amount).toFixed(2)}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      scheduleRowId,
      rowKind: row.row_kind,
      previousDiscountGbp: existingTotal,
      newDiscountGbp: amount,
      discountChange: true,
      comment: reason,
      paymentStatusEventId: (discountStatusEvent?.id as string | undefined) ?? null,
    },
  });

  await refreshVehicleFinancialsForHire(row.hire_group_id as string);
  return { ok: true };
}

export async function loadHirePaymentRowEventsAction(
  scheduleRowId: string,
): Promise<{ ok: true; events: HirePaymentRowEventDisplay[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const id = scheduleRowId.trim();
  if (!id) return { ok: false, error: "Payment row not found." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select("id, vehicle_hire_groups(driver_user_id, parent_company_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const groupRaw = row.vehicle_hire_groups as
    | { driver_user_id: string | null; parent_company_id: string | null }
    | { driver_user_id: string | null; parent_company_id: string | null }[]
    | null;
  const group = Array.isArray(groupRaw) ? (groupRaw[0] ?? null) : groupRaw;
  const isDriver = group?.driver_user_id === user.id;
  if (!isDriver) {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    const companyId = profile.company_id?.trim();
    if (!companyId || group?.parent_company_id !== companyId) {
      return { ok: false, error: "Payment row not found." };
    }
  }

  const [{ data: events, error: eventsErr }, { data: discounts, error: discountErr }] = await Promise.all([
    supabase
      .from("vehicle_hire_payment_status_events")
      .select(
        "id, event_kind, from_status, to_status, comment, amendment_payload, actor_role, actor_user_id, created_at",
      )
      .eq("schedule_row_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("vehicle_hire_schedule_discounts")
      .select("id, amount_gbp, reason, applied_by_user_id, applied_at")
      .eq("schedule_row_id", id)
      .order("applied_at", { ascending: true }),
  ]);
  if (eventsErr) return { ok: false, error: eventsErr.message };
  if (discountErr) return { ok: false, error: discountErr.message };

  const actorIds = [
    ...(events ?? []).map((event) => (event.actor_user_id as string | null) ?? null),
    ...(discounts ?? []).map((discount) => (discount.applied_by_user_id as string | null) ?? null),
  ];

  let names: Record<string, string> = {};
  try {
    const admin = createSupabaseAdminClient();
    names = await loadHireAuditActorDisplayNames(admin, actorIds);
  } catch {
    names = {};
  }

  const mappedEvents = (events ?? []).map((event) => {
    const actorUserId = (event.actor_user_id as string | null)?.trim() || null;
    return {
      id: event.id as string,
      eventKind: event.event_kind as "status_change" | "reply" | "amendment",
      fromStatus: (event.from_status as string | null) ?? null,
      toStatus: (event.to_status as string | null) ?? null,
      comment: (event.comment as string | null) ?? null,
      amendmentPayload: (event.amendment_payload as Record<string, unknown> | null) ?? null,
      actorRole: event.actor_role as "company_staff" | "driver",
      actorDisplayName: actorUserId ? names[actorUserId] ?? null : null,
      createdAt: event.created_at as string,
    };
  });

  const mappedDiscounts = (discounts ?? []).map((discount) => {
    const appliedBy = (discount.applied_by_user_id as string | null)?.trim() || null;
    return {
      id: discount.id as string,
      amountGbp: Number(discount.amount_gbp ?? 0),
      reason: String(discount.reason ?? ""),
      appliedAt: discount.applied_at as string,
      appliedByDisplayName: appliedBy ? names[appliedBy] ?? null : null,
    };
  });

  return {
    ok: true,
    events: mergeHirePaymentRowHistory({
      events: mappedEvents,
      discounts: mappedDiscounts,
    }),
  };
}

/** One-off PDF payment statement for an ended hire (not stored). Staff only. */
export async function exportHirePaymentStatementAction(
  hireGroupId: string,
): Promise<{ ok: true; base64: string; fileName: string } | { ok: false; error: string }> {
  return exportHirePaymentStatementForAudience(hireGroupId, "staff");
}

/** One-off PDF payment statement for an ended hire (not stored). Driver only. */
export async function exportDriverHirePaymentStatementAction(
  hireGroupId: string,
): Promise<{ ok: true; base64: string; fileName: string } | { ok: false; error: string }> {
  return exportHirePaymentStatementForAudience(hireGroupId, "driver");
}

async function exportHirePaymentStatementForAudience(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<{ ok: true; base64: string; fileName: string } | { ok: false; error: string }> {
  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  let page: Awaited<ReturnType<typeof buildPaymentsPageData>>;
  if (audience === "driver") {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Sign in required." };
    page = await buildPaymentsPageData(id, { driverUserId: user.id });
  } else {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    page = await buildPaymentsPageData(id, {});
  }

  if (!page.ok) return page;
  if (!page.data.contractEndedYmd) {
    return { ok: false, error: "Payment statements are available after the contract has ended." };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const { loadHireInspectionReportPdfContext } = await import(
    "@/lib/fleet/hire-inspection-report-context"
  );
  const { buildHirePaymentStatementPdf } = await import("@/lib/fleet/hire-payment-statement-pdf");
  const { buildHirePaymentStatementContent } = await import("@/lib/fleet/hire-payment-statement");
  const { formatUkDateTime } = await import("@/lib/datetime/uk");

  const supabase = await createClient();
  const context = await loadHireInspectionReportPdfContext(supabase, id, "checkin");
  if (!context.ok) return { ok: false, error: context.error };

  const statementContent = buildHirePaymentStatementContent(page.data, { audience });
  const pdf = await buildHirePaymentStatementPdf(
    page.data,
    {
      ...context.summary,
      title: audience === "driver" ? "Your hire payment statement" : "Hire payment statement",
      documentLabel: "Payment statement",
      metaLine: page.data.contractEndedAtLabel
        ? audience === "driver"
          ? `Hire ended: ${page.data.contractEndedAtLabel}`
          : `Contract ended: ${page.data.contractEndedAtLabel}`
        : `Generated: ${formatUkDateTime(new Date().toISOString())}`,
    },
    statementContent,
  );

  return {
    ok: true,
    base64: Buffer.from(pdf.bytes).toString("base64"),
    fileName: pdf.fileName,
  };
}
