import { netRowAmountGbp } from "@/lib/fleet/hire-payment-schedule";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

/** Schedule row inputs for payment summary (mapped from DB on the server). */
export type HirePaymentScheduleRowInput = {
  id: string;
  periodStart: string;
  periodEnd: string;
  rowKind: "rent" | "deposit";
  baseAmountGbp: number;
  discountTotalGbp: number;
  paymentStatus: HirePaymentStatus;
  approvedAmountGbp: number | null;
  /** Amount submitted by driver/staff awaiting approval (from latest pending event). */
  pendingSubmittedGbp: number | null;
  sortOrder: number;
};

export type HirePaymentSummary = {
  totalDueGbp: number;
  totalPaidGbp: number;
  balanceGbp: number;
  /** Outstanding balance across the full payment sheet (includes future periods). */
  scheduleBalanceGbp: number;
  totalDiscountGbp: number;
  contractTotalGbp: number;
  nextDue: { rowId: string; amountGbp: number; periodStart: string; periodEnd: string } | null;
};

export type HirePaymentRowComputed = HirePaymentScheduleRowInput & {
  netDueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  accrued: boolean;
};

/** Deposit rows sort before rent; then by period start. */
export function sortHirePaymentRows(rows: HirePaymentScheduleRowInput[]): HirePaymentScheduleRowInput[] {
  return [...rows].sort((a, b) => {
    if (a.rowKind === "deposit" && b.rowKind !== "deposit") return -1;
    if (b.rowKind === "deposit" && a.rowKind !== "deposit") return 1;
    if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
    return a.sortOrder - b.sortOrder;
  });
}

/** Approved amount counts as paid even when a later submission was rejected or is pending. */
export function hirePaymentRowPaidGbp(row: HirePaymentScheduleRowInput): number {
  const net = netRowAmountGbp(row.baseAmountGbp, row.discountTotalGbp);
  if (row.approvedAmountGbp != null && row.approvedAmountGbp >= 0) {
    return Math.min(net, Math.round(row.approvedAmountGbp * 100) / 100);
  }
  if (row.paymentStatus === "approved") return net;
  return 0;
}

export function hirePaymentRowNetDueGbp(row: HirePaymentScheduleRowInput): number {
  return netRowAmountGbp(row.baseAmountGbp, row.discountTotalGbp);
}

export function hirePaymentRowBalanceGbp(row: HirePaymentScheduleRowInput): number {
  return Math.max(0, Math.round((hirePaymentRowNetDueGbp(row) - hirePaymentRowPaidGbp(row)) * 100) / 100);
}

/** Accrued = period has started (UK calendar day). Future rent periods are excluded from total due. */
export function isHirePaymentRowAccrued(row: HirePaymentScheduleRowInput, todayYmd: string): boolean {
  return row.periodStart <= todayYmd;
}

export function enrichHirePaymentRows(
  rows: HirePaymentScheduleRowInput[],
  todayYmd: string,
): HirePaymentRowComputed[] {
  return sortHirePaymentRows(rows).map((row) => ({
    ...row,
    netDueGbp: hirePaymentRowNetDueGbp(row),
    paidGbp: hirePaymentRowPaidGbp(row),
    balanceGbp: hirePaymentRowBalanceGbp(row),
    accrued: isHirePaymentRowAccrued(row, todayYmd),
  }));
}

/**
 * Headline totals for staff/driver payment UI.
 * Total due = accrued net minus approved payments (not the full contract to end date).
 */
export function summarizeHirePayments(
  rows: HirePaymentScheduleRowInput[],
  todayYmd: string,
): HirePaymentSummary {
  const enriched = enrichHirePaymentRows(rows, todayYmd);
  let totalDueGbp = 0;
  let totalPaidGbp = 0;
  let scheduleBalanceGbp = 0;
  let totalDiscountGbp = 0;
  let contractTotalGbp = 0;
  let nextDue: HirePaymentSummary["nextDue"] = null;

  for (const row of enriched) {
    totalDiscountGbp += row.discountTotalGbp;
    contractTotalGbp += row.netDueGbp;
    if (row.balanceGbp > 0 && row.paymentStatus !== "pending_approval") {
      scheduleBalanceGbp += row.balanceGbp;
    }
    if (!row.accrued) continue;
    totalDueGbp += row.netDueGbp;
    totalPaidGbp += row.paidGbp;
    if (row.balanceGbp > 0 && !nextDue) {
      nextDue = {
        rowId: row.id,
        amountGbp: row.balanceGbp,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      };
    }
  }

  const balanceGbp = Math.max(0, Math.round((totalDueGbp - totalPaidGbp) * 100) / 100);

  return {
    totalDueGbp: Math.round(totalDueGbp * 100) / 100,
    totalPaidGbp: Math.round(totalPaidGbp * 100) / 100,
    balanceGbp,
    scheduleBalanceGbp: Math.round(scheduleBalanceGbp * 100) / 100,
    totalDiscountGbp: Math.round(totalDiscountGbp * 100) / 100,
    contractTotalGbp: Math.round(contractTotalGbp * 100) / 100,
    nextDue,
  };
}
