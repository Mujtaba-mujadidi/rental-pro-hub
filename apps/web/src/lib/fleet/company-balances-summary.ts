/**
 * Company Balances page — pure summary over hire schedule, extras and settlement facts.
 * UI and server action must both use these helpers so KPI cards match table rows.
 */

import { formatUkDateRangeText, formatUkDateText, ukTodayYmd } from "@/lib/datetime/uk";
import {
  endedHireDriverOwesCompanyGbp,
  isEndedHireStatus,
  scheduleRowPaidInWindowGbp,
  type DashboardHireFact,
  type DashboardScheduleFact,
} from "@/lib/fleet/company-dashboard-display";
import { resolveCompanyDashboardPeriod } from "@/lib/fleet/company-dashboard-period";
import { outstandingExtraChargesGbp } from "@/lib/fleet/hire-driver-charges";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  hirePaymentRowBalanceGbp,
  isHirePaymentRowAccrued,
  summarizeHirePayments,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

export const COMPANY_BALANCES_TABS = [
  "active",
  "payment_review",
  "final_settlements",
  "all",
] as const;
export type CompanyBalancesTab = (typeof COMPANY_BALANCES_TABS)[number];

export const COMPANY_BALANCES_TAB_OPTIONS: { value: CompanyBalancesTab; label: string }[] = [
  { value: "active", label: "Active balances" },
  { value: "payment_review", label: "Payment review" },
  { value: "final_settlements", label: "Final settlements" },
  { value: "all", label: "All balances" },
];

export type CompanyBalancesSubcompanyOption = {
  id: string;
  name: string;
};

export type CompanyBalancesHireFact = Pick<
  DashboardHireFact,
  | "id"
  | "status"
  | "settlementBalanceDirection"
  | "settlementOpenBalanceGbp"
  | "rentBillingMode"
  | "rentCadence"
  | "terminatedAtYmd"
  | "endedAtYmd"
> & {
  subcompanyId: string | null;
  subcompanyName: string | null;
  vehicleVrm: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  driverLabel: string | null;
  startDateYmd: string | null;
  activatedAtYmd: string | null;
  /** Frozen totals from termination_settlement; used so settled hires skip live schedule loads. */
  snapshotChargesGbp?: number | null;
  snapshotReceivedGbp?: number | null;
};

export type CompanyBalancesScheduleFact = DashboardScheduleFact & {
  scheduleRowId: string;
  pendingSubmittedGbp: number | null;
};

export type CompanyBalancesExtraChargeFact = {
  amountGbp: number;
  resolution: HireInspectionDamageChargeResolution | string;
};

export type CompanyBalancesSettlementPaymentFact = {
  id: string;
  hireGroupId: string;
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory: string;
  paidAt: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
};

export type CompanyBalancesAccountStatus = "active" | "payment_review" | "open_settlement" | "settled";

export type CompanyBalancesAccountRow = {
  hireGroupId: string;
  vehicleVrm: string;
  vehicleLabel: string | null;
  driverLabel: string;
  subcompanyId: string | null;
  subcompanyName: string | null;
  periodLabel: string;
  chargesGbp: number;
  receivedGbp: number;
  balanceGbp: number;
  pendingReviewGbp: number;
  accountStatus: CompanyBalancesAccountStatus;
  statusLabel: string;
  href: string;
};

export type CompanyBalancesActivityRow = {
  id: string;
  hireGroupId: string;
  title: string;
  detail: string;
  amountGbp: number;
  at: string;
  href: string;
};

export type CompanyBalancesKpis = {
  outstandingAcrossHiresGbp: number;
  activeHireAccountCount: number;
  pendingReviewGbp: number;
  pendingReviewSubmissionCount: number;
  receivedThisMonthGbp: number;
  finalSettlementsCount: number;
  finalSettlementsPaidInFullCount: number;
};

export type CompanyBalancesPageData = {
  kpis: CompanyBalancesKpis;
  accountRows: CompanyBalancesAccountRow[];
  subcompanies: CompanyBalancesSubcompanyOption[];
  defaultTab: CompanyBalancesTab;
  monthStartYmd: string;
  monthEndYmd: string;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function toScheduleInput(row: CompanyBalancesScheduleFact): HirePaymentScheduleRowInput {
  return {
    id: row.scheduleRowId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: 0,
  };
}

function toDashboardHire(hire: CompanyBalancesHireFact): DashboardHireFact {
  return {
    id: hire.id,
    vehicleId: "",
    subcompanyId: hire.subcompanyId ?? "",
    status: hire.status,
    startDateYmd: hire.startDateYmd,
    activatedAtYmd: hire.activatedAtYmd,
    endedAtYmd: hire.endedAtYmd,
    terminatedAtYmd: hire.terminatedAtYmd,
    rentAmountGbp: 0,
    rentCadence: hire.rentCadence,
    unsignedAgreementCount: 0,
    insuranceStatus: "none",
    settlementBalanceDirection: hire.settlementBalanceDirection,
    settlementOpenBalanceGbp: hire.settlementOpenBalanceGbp,
    rentBillingMode: hire.rentBillingMode,
  };
}

function toDashboardSchedule(row: CompanyBalancesScheduleFact): DashboardScheduleFact {
  return {
    hireGroupId: row.hireGroupId,
    vehicleId: "",
    subcompanyId: "",
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
  };
}

export function companyBalancesVehicleLabel(
  hire: Pick<CompanyBalancesHireFact, "vehicleMake" | "vehicleModel">,
): string | null {
  const label = [hire.vehicleMake, hire.vehicleModel].filter(Boolean).join(" ").trim();
  return label || null;
}

export function companyBalancesPeriodLabel(
  hire: Pick<
    CompanyBalancesHireFact,
    "startDateYmd" | "activatedAtYmd" | "terminatedAtYmd" | "endedAtYmd" | "status"
  >,
): string {
  const start = hire.startDateYmd ?? hire.activatedAtYmd;
  if (isEndedHireStatus(hire.status)) {
    return formatUkDateRangeText(start, hire.terminatedAtYmd ?? hire.endedAtYmd);
  }
  if (!start) return "Ongoing";
  return `${formatUkDateText(start)} — ongoing`;
}

export function companyBalancesAccountHref(hireGroupId: string): string {
  return `/rental/balances/${hireGroupId}`;
}

/** Live schedule / extras / events are required for active accounts and open settlements only. */
export function hireNeedsLiveBalanceFacts(
  hire: Pick<CompanyBalancesHireFact, "status" | "settlementBalanceDirection">,
): boolean {
  if (hire.status === "active") return true;
  if (!isEndedHireStatus(hire.status)) return false;
  return hire.settlementBalanceDirection !== "settled";
}

export function parseHireBalanceSnapshotFromTermination(raw: unknown): {
  chargesGbp: number | null;
  receivedGbp: number | null;
} {
  if (!raw || typeof raw !== "object") return { chargesGbp: null, receivedGbp: null };
  const record = raw as {
    totalDueGbp?: unknown;
    totalPaidGbp?: unknown;
    accruedRentDueGbp?: unknown;
    accruedRentPaidGbp?: unknown;
  };
  const due = Number(record.totalDueGbp ?? record.accruedRentDueGbp);
  const paid = Number(record.totalPaidGbp ?? record.accruedRentPaidGbp);
  return {
    chargesGbp: Number.isFinite(due) ? roundGbp(due) : null,
    receivedGbp: Number.isFinite(paid) ? roundGbp(paid) : null,
  };
}

export function pendingApprovalAmountGbp(row: CompanyBalancesScheduleFact): number {
  if (row.paymentStatus !== ("pending_approval" as HirePaymentStatus)) return 0;
  const schedule = toScheduleInput(row);
  const balance = Math.max(0, hirePaymentRowBalanceGbp(schedule));
  const submitted = row.pendingSubmittedGbp;
  if (submitted != null && Number.isFinite(submitted) && submitted > 0.005) {
    return roundGbp(submitted);
  }
  return roundGbp(balance);
}

/**
 * Accrued rent still chaseable on a schedule row.
 * Pending submissions are not chased again; any shortfall after a partial submit stays due.
 */
export function chaseableScheduleRentGbp(
  row: CompanyBalancesScheduleFact,
  todayYmd: string,
): number {
  if (row.rowKind !== "rent") return 0;
  const schedule = toScheduleInput(row);
  if (!isHirePaymentRowAccrued(schedule, todayYmd)) return 0;
  const balance = hirePaymentRowBalanceGbp(schedule);
  if (balance <= 0.005) return 0;

  if (row.paymentStatus !== ("pending_approval" as HirePaymentStatus)) {
    return roundGbp(balance);
  }

  const submittedRaw = row.pendingSubmittedGbp;
  const submitted =
    submittedRaw != null && Number.isFinite(submittedRaw) && submittedRaw > 0.005
      ? roundGbp(submittedRaw)
      : roundGbp(balance);
  return roundGbp(Math.max(0, balance - submitted));
}

function sumExtraChargesGbp(charges: readonly CompanyBalancesExtraChargeFact[]): number {
  let total = 0;
  for (const item of charges) {
    if (item.resolution === "waived") continue;
    if (item.resolution === "add_to_balance" || item.resolution === "paid_now") {
      total += item.amountGbp;
    }
  }
  return roundGbp(total);
}

function sumReceivedFromDriverGbp(
  payments: readonly CompanyBalancesSettlementPaymentFact[],
): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.direction !== "received_from_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

/** Active hire account totals: accrued rent due + extras charged vs approved receipts. */
export function activeHireAccountFinancials(input: {
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  extraCharges: readonly CompanyBalancesExtraChargeFact[];
  balancePayments: readonly CompanyBalancesSettlementPaymentFact[];
  todayYmd: string;
}): { chargesGbp: number; receivedGbp: number; balanceGbp: number } {
  const scheduleInputs = input.scheduleRows.map(toScheduleInput);
  const summary = summarizeHirePayments(scheduleInputs, input.todayYmd);
  const extrasGbp = sumExtraChargesGbp(input.extraCharges);
  const extraOutstanding = outstandingExtraChargesGbp(
    input.extraCharges.map((item) => ({
      amountGbp: item.amountGbp,
      resolution: item.resolution as HireInspectionDamageChargeResolution,
    })),
    input.balancePayments.map((payment) => ({
      amountGbp: payment.amountGbp,
      direction: payment.direction,
      paymentCategory: payment.paymentCategory,
    })),
  );
  const extraReceivedGbp = roundGbp(Math.max(0, extrasGbp - extraOutstanding));
  const settlementReceivedGbp = sumReceivedFromDriverGbp(
    input.balancePayments.filter((payment) => payment.paymentCategory !== "driver_charge"),
  );
  let rentOutstandingGbp = 0;
  for (const row of input.scheduleRows) {
    rentOutstandingGbp = roundGbp(rentOutstandingGbp + chaseableScheduleRentGbp(row, input.todayYmd));
  }

  return {
    chargesGbp: roundGbp(summary.totalDueGbp + extrasGbp),
    receivedGbp: roundGbp(summary.totalPaidGbp + extraReceivedGbp + settlementReceivedGbp),
    balanceGbp: roundGbp(rentOutstandingGbp + extraOutstanding),
  };
}

/** Ended hire account totals for balances list and final settlement tab. */
export function endedHireAccountFinancials(input: {
  hire: CompanyBalancesHireFact;
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  extraCharges: readonly CompanyBalancesExtraChargeFact[];
  balancePayments: readonly CompanyBalancesSettlementPaymentFact[];
  todayYmd: string;
}): { chargesGbp: number; receivedGbp: number; balanceGbp: number; settled: boolean } {
  const endedYmd = input.hire.terminatedAtYmd ?? input.hire.endedAtYmd ?? input.todayYmd;
  const scheduleInputs = input.scheduleRows.map(toScheduleInput);
  const summary = summarizeHirePayments(scheduleInputs, endedYmd);
  const extrasGbp = sumExtraChargesGbp(input.extraCharges);
  const extraOutstanding = outstandingExtraChargesGbp(
    input.extraCharges.map((item) => ({
      amountGbp: item.amountGbp,
      resolution: item.resolution as HireInspectionDamageChargeResolution,
    })),
    input.balancePayments.map((payment) => ({
      amountGbp: payment.amountGbp,
      direction: payment.direction,
      paymentCategory: payment.paymentCategory,
    })),
  );
  const extraReceivedGbp = roundGbp(Math.max(0, extrasGbp - extraOutstanding));
  const settlementReceivedGbp = sumReceivedFromDriverGbp(input.balancePayments);
  const settled = input.hire.settlementBalanceDirection === "settled";
  const openSettlement = computeHireWorkspaceSettlementBalance({
    settlementBalanceDirection: input.hire.settlementBalanceDirection,
    settlementBalanceGbp: input.hire.settlementOpenBalanceGbp,
    balancePayments: input.balancePayments.map((payment) => ({
      amountGbp: payment.amountGbp,
      direction: payment.direction,
    })),
  });
  const driverOwesGbp =
    openSettlement?.settlementDirection === "driver_owes_company"
      ? openSettlement.openBalanceGbp
      : endedHireDriverOwesCompanyGbp(
          toDashboardHire(input.hire),
          input.scheduleRows.map(toDashboardSchedule),
        );

  return {
    chargesGbp: roundGbp(summary.totalDueGbp + extrasGbp),
    receivedGbp: roundGbp(summary.totalPaidGbp + extraReceivedGbp + settlementReceivedGbp),
    balanceGbp: settled ? 0 : roundGbp(Math.max(0, driverOwesGbp, extraOutstanding)),
    settled,
  };
}

function pendingReviewForHire(input: {
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  pendingExtraGbp: number;
}): { pendingGbp: number; submissionCount: number } {
  let pendingGbp = roundGbp(Math.max(0, input.pendingExtraGbp));
  let submissionCount = input.pendingExtraGbp > 0.005 ? 1 : 0;
  for (const row of input.scheduleRows) {
    const amountGbp = pendingApprovalAmountGbp(row);
    if (amountGbp <= 0.005) continue;
    pendingGbp = roundGbp(pendingGbp + amountGbp);
    submissionCount += 1;
  }
  return { pendingGbp, submissionCount };
}

export function buildCompanyBalancesAccountRows(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  extraChargesByHireId: ReadonlyMap<string, readonly CompanyBalancesExtraChargeFact[]>;
  balancePaymentsByHireId: ReadonlyMap<string, readonly CompanyBalancesSettlementPaymentFact[]>;
  pendingExtraByHireId: ReadonlyMap<string, number>;
  todayYmd: string;
}): CompanyBalancesAccountRow[] {
  const scheduleByHire = new Map<string, CompanyBalancesScheduleFact[]>();
  for (const row of input.scheduleRows) {
    const bucket = scheduleByHire.get(row.hireGroupId) ?? [];
    bucket.push(row);
    scheduleByHire.set(row.hireGroupId, bucket);
  }

  const rows: CompanyBalancesAccountRow[] = [];
  for (const hire of input.hires) {
    if (hire.status === "cancelled" || hire.status === "draft") continue;

    const schedule = scheduleByHire.get(hire.id) ?? [];
    const extraCharges = input.extraChargesByHireId.get(hire.id) ?? [];
    const balancePayments = input.balancePaymentsByHireId.get(hire.id) ?? [];
    const pendingExtraGbp = input.pendingExtraByHireId.get(hire.id) ?? 0;
    const pendingReview = pendingReviewForHire({ scheduleRows: schedule, pendingExtraGbp });
    const common = {
      hireGroupId: hire.id,
      vehicleVrm: hire.vehicleVrm?.trim() || "—",
      vehicleLabel: companyBalancesVehicleLabel(hire),
      driverLabel: hire.driverLabel?.trim() || "Driver",
      subcompanyId: hire.subcompanyId,
      subcompanyName: hire.subcompanyName,
      periodLabel: companyBalancesPeriodLabel(hire),
      pendingReviewGbp: pendingReview.pendingGbp,
      href: companyBalancesAccountHref(hire.id),
    };

    if (isEndedHireStatus(hire.status)) {
      if (hire.settlementBalanceDirection === "settled") {
        rows.push({
          ...common,
          chargesGbp: roundGbp(hire.snapshotChargesGbp ?? 0),
          receivedGbp: roundGbp(hire.snapshotReceivedGbp ?? 0),
          balanceGbp: 0,
          accountStatus: "settled",
          statusLabel: "Settled",
        });
        continue;
      }
      const financials = endedHireAccountFinancials({
        hire,
        scheduleRows: schedule,
        extraCharges,
        balancePayments,
        todayYmd: input.todayYmd,
      });
      rows.push({
        ...common,
        chargesGbp: financials.chargesGbp,
        receivedGbp: financials.receivedGbp,
        balanceGbp: financials.balanceGbp,
        accountStatus: financials.settled ? "settled" : "open_settlement",
        statusLabel: financials.settled ? "Settled" : "Open settlement",
      });
      continue;
    }

    if (hire.status !== "active") continue;

    const financials = activeHireAccountFinancials({
      scheduleRows: schedule,
      extraCharges,
      balancePayments,
      todayYmd: input.todayYmd,
    });
    rows.push({
      ...common,
      chargesGbp: financials.chargesGbp,
      receivedGbp: financials.receivedGbp,
      balanceGbp: financials.balanceGbp,
      accountStatus: pendingReview.pendingGbp > 0.005 ? "payment_review" : "active",
      statusLabel: "Active account",
    });
  }

  rows.sort((a, b) => {
    if (b.balanceGbp !== a.balanceGbp) return b.balanceGbp - a.balanceGbp;
    return b.chargesGbp - a.chargesGbp;
  });
  return rows;
}

export function buildCompanyBalancesActivityRows(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  settlementPayments: readonly CompanyBalancesSettlementPaymentFact[];
  monthStartYmd: string;
  monthEndYmd: string;
}): CompanyBalancesActivityRow[] {
  const hireById = new Map(input.hires.map((h) => [h.id, h]));
  const rows: CompanyBalancesActivityRow[] = [];

  for (const row of input.scheduleRows) {
    if (row.rowKind !== "rent") continue;
    const paid = scheduleRowPaidInWindowGbp(row, input.monthStartYmd, input.monthEndYmd);
    if (paid <= 0.005) continue;
    const hire = hireById.get(row.hireGroupId);
    rows.push({
      id: `schedule:${row.scheduleRowId}`,
      hireGroupId: row.hireGroupId,
      title: "Rent collected",
      detail: [hire?.vehicleVrm, hire?.driverLabel].filter(Boolean).join(" · ") || "Hire payment",
      amountGbp: roundGbp(paid),
      at: `${row.periodStart}T00:00:00.000Z`,
      href: companyBalancesAccountHref(row.hireGroupId),
    });
  }

  for (const payment of input.settlementPayments) {
    if (payment.direction !== "received_from_driver") continue;
    const ymd = paidAtYmd(payment.paidAt);
    if (!ymd || ymd < input.monthStartYmd || ymd > input.monthEndYmd) continue;
    const amount = roundGbp(Math.abs(Number(payment.amountGbp) || 0));
    if (amount <= 0.005) continue;
    rows.push({
      id: `settlement:${payment.id}`,
      hireGroupId: payment.hireGroupId,
      title: payment.paymentCategory === "driver_charge" ? "Driver charge collected" : "Settlement collected",
      detail: [payment.vehicleVrm, payment.driverLabel].filter(Boolean).join(" · ") || "Settlement payment",
      amountGbp: amount,
      at: payment.paidAt,
      href: companyBalancesAccountHref(payment.hireGroupId),
    });
  }

  rows.sort((a, b) => b.at.localeCompare(a.at));
  return rows;
}

function paidAtYmd(paidAt: string): string | null {
  const raw = paidAt.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function buildCompanyBalancesKpis(input: {
  accountRows: readonly CompanyBalancesAccountRow[];
  activityRows: readonly CompanyBalancesActivityRow[];
  pendingReviewSubmissionCount: number;
}): CompanyBalancesKpis {
  let outstandingAcrossHiresGbp = 0;
  let activeHireAccountCount = 0;
  let pendingReviewGbp = 0;
  let finalSettlementsCount = 0;
  let finalSettlementsPaidInFullCount = 0;

  for (const row of input.accountRows) {
    if (row.accountStatus === "active" || row.accountStatus === "payment_review") {
      activeHireAccountCount += 1;
      outstandingAcrossHiresGbp = roundGbp(outstandingAcrossHiresGbp + row.balanceGbp);
    }
    pendingReviewGbp = roundGbp(pendingReviewGbp + row.pendingReviewGbp);
    if (row.accountStatus === "settled") {
      finalSettlementsCount += 1;
      if (row.balanceGbp <= 0.005) finalSettlementsPaidInFullCount += 1;
    }
  }

  let receivedThisMonthGbp = 0;
  for (const row of input.activityRows) {
    receivedThisMonthGbp = roundGbp(receivedThisMonthGbp + row.amountGbp);
  }

  return {
    outstandingAcrossHiresGbp,
    activeHireAccountCount,
    pendingReviewGbp,
    pendingReviewSubmissionCount: input.pendingReviewSubmissionCount,
    receivedThisMonthGbp,
    finalSettlementsCount,
    finalSettlementsPaidInFullCount,
  };
}

export function companyBalancesKpiSubtext(kpis: CompanyBalancesKpis): {
  outstandingAcrossHires: string;
  pendingReview: string;
  receivedThisMonth: string;
  finalSettlements: string;
} {
  return {
    outstandingAcrossHires:
      kpis.activeHireAccountCount === 0
        ? "No active hire accounts"
        : `${kpis.activeHireAccountCount.toLocaleString("en-GB")} active hire ${
            kpis.activeHireAccountCount === 1 ? "account" : "accounts"
          }`,
    pendingReview:
      kpis.pendingReviewSubmissionCount === 0
        ? "No submissions waiting"
        : `${kpis.pendingReviewSubmissionCount.toLocaleString("en-GB")} ${
            kpis.pendingReviewSubmissionCount === 1 ? "submission needs approval" : "submissions need approval"
          }`,
    receivedThisMonth: "Approved payments",
    finalSettlements:
      kpis.finalSettlementsCount === 0
        ? "No ended hires settled yet"
        : kpis.finalSettlementsPaidInFullCount === kpis.finalSettlementsCount
          ? "All paid in full"
          : `${kpis.finalSettlementsPaidInFullCount.toLocaleString("en-GB")} of ${kpis.finalSettlementsCount.toLocaleString("en-GB")} paid in full`,
  };
}

export function defaultCompanyBalancesTab(kpis: CompanyBalancesKpis): CompanyBalancesTab {
  if (kpis.pendingReviewGbp > 0.005) return "payment_review";
  if (kpis.outstandingAcrossHiresGbp > 0.005 || kpis.activeHireAccountCount > 0) return "active";
  if (kpis.finalSettlementsCount > 0) return "final_settlements";
  return "all";
}

export function companyBalancesAccountsForTab(
  rows: readonly CompanyBalancesAccountRow[],
  tab: CompanyBalancesTab,
): CompanyBalancesAccountRow[] {
  if (tab === "active") {
    return rows.filter(
      (row) =>
        (row.accountStatus === "active" || row.accountStatus === "payment_review") &&
        (row.chargesGbp > 0.005 ||
          row.receivedGbp > 0.005 ||
          row.balanceGbp > 0.005 ||
          row.pendingReviewGbp > 0.005),
    );
  }
  if (tab === "payment_review") {
    return rows.filter((row) => row.pendingReviewGbp > 0.005);
  }
  if (tab === "final_settlements") {
    return rows.filter((row) => row.accountStatus === "settled");
  }
  return [...rows];
}

export function filterCompanyBalancesAccounts(input: {
  rows: readonly CompanyBalancesAccountRow[];
  search: string;
  subcompanyId: string | null;
}): CompanyBalancesAccountRow[] {
  const query = input.search.trim().toLowerCase();
  return input.rows.filter((row) => {
    if (input.subcompanyId && row.subcompanyId !== input.subcompanyId) return false;
    if (!query) return true;
    const haystack = [
      row.vehicleVrm,
      row.vehicleLabel,
      row.driverLabel,
      row.subcompanyName,
      row.periodLabel,
      row.statusLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function buildCompanyBalancesPage(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  extraChargesByHireId: ReadonlyMap<string, readonly CompanyBalancesExtraChargeFact[]>;
  balancePaymentsByHireId: ReadonlyMap<string, readonly CompanyBalancesSettlementPaymentFact[]>;
  pendingExtraByHireId: ReadonlyMap<string, number>;
  subcompanies: readonly CompanyBalancesSubcompanyOption[];
  todayYmd?: string;
}): CompanyBalancesPageData {
  const todayYmd = input.todayYmd ?? ukTodayYmd();
  const period = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd });
  if ("error" in period) {
    throw new Error(period.error);
  }

  const accountRows = buildCompanyBalancesAccountRows({
    hires: input.hires,
    scheduleRows: input.scheduleRows,
    extraChargesByHireId: input.extraChargesByHireId,
    balancePaymentsByHireId: input.balancePaymentsByHireId,
    pendingExtraByHireId: input.pendingExtraByHireId,
    todayYmd,
  });

  const settlementPayments = [...input.balancePaymentsByHireId.values()].flat();
  const activityRows = buildCompanyBalancesActivityRows({
    hires: input.hires,
    scheduleRows: input.scheduleRows,
    settlementPayments,
    monthStartYmd: period.startYmd,
    monthEndYmd: period.endYmd,
  });

  let pendingReviewSubmissionCount = 0;
  for (const pendingExtraGbp of input.pendingExtraByHireId.values()) {
    if (pendingExtraGbp > 0.005) pendingReviewSubmissionCount += 1;
  }
  for (const row of input.scheduleRows) {
    if (pendingApprovalAmountGbp(row) > 0.005) pendingReviewSubmissionCount += 1;
  }

  const kpis = buildCompanyBalancesKpis({
    accountRows,
    activityRows,
    pendingReviewSubmissionCount,
  });

  return {
    kpis,
    accountRows,
    subcompanies: [...input.subcompanies],
    defaultTab: defaultCompanyBalancesTab(kpis),
    monthStartYmd: period.startYmd,
    monthEndYmd: period.endYmd,
  };
}

export function buildCompanyBalancesExportCsv(
  data: CompanyBalancesPageData,
  tab: CompanyBalancesTab,
  rows: readonly CompanyBalancesAccountRow[],
): string {
  const lines: string[] = ["\uFEFFSection,Item,Value"];
  const cell = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  lines.push(["KPI", "Outstanding across hires GBP", data.kpis.outstandingAcrossHiresGbp].map(cell).join(","));
  lines.push(["KPI", "Payments under review GBP", data.kpis.pendingReviewGbp].map(cell).join(","));
  lines.push(["KPI", "Received this month GBP", data.kpis.receivedThisMonthGbp].map(cell).join(","));
  lines.push(["KPI", "Final settlements", data.kpis.finalSettlementsCount].map(cell).join(","));

  for (const row of rows) {
    lines.push(
      [
        tab,
        `${row.vehicleVrm} · ${row.driverLabel}`,
        `Charges ${row.chargesGbp}; Received ${row.receivedGbp}; Balance ${row.balanceGbp}`,
      ]
        .map(cell)
        .join(","),
    );
  }

  return lines.join("\n");
}

export function companyBalancesExportFileName(todayYmd = ukTodayYmd()): string {
  return `balances-export-${todayYmd}.csv`;
}

export function companyBalancesTabFooterHint(tab: CompanyBalancesTab): string {
  if (tab === "active") {
    return "Active accounts update as charges and approved payments are posted";
  }
  if (tab === "payment_review") {
    return "Submitted payments stay here until finance approves or rejects them";
  }
  if (tab === "final_settlements") {
    return "Ended hires with a cleared settlement balance";
  }
  return "Every hire account in your accessible subcompanies";
}
