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
  /** Gross rent on accrued periods (base amounts, before discounts). */
  rentGrossAccruedGbp: number;
  totalDueGbp: number;
  totalPaidGbp: number;
  /** Outstanding arrears on accrued rent periods (never negative). */
  balanceGbp: number;
  /** Driver credit from rent overpayment / prepaid future rent (never negative). */
  creditGbp: number;
  /** Signed accrued balance: positive = driver owes, negative = credit. */
  signedAccruedBalanceGbp: number;
  /** Outstanding balance across the full payment sheet (includes deposit and future periods). */
  scheduleBalanceGbp: number;
  /** Discounts on accrued rent periods only. */
  totalDiscountGbp: number;
  /** Full contract rent after discounts (rent rows only, excludes deposit). */
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

/** Approved amount counts toward paid; may exceed net due (overpayment on row). */
export function hirePaymentRowPaidGbp(row: HirePaymentScheduleRowInput): number {
  const net = netRowAmountGbp(row.baseAmountGbp, row.discountTotalGbp);
  if (row.approvedAmountGbp != null && row.approvedAmountGbp >= 0) {
    return Math.round(row.approvedAmountGbp * 100) / 100;
  }
  if (row.paymentStatus === "approved") return net;
  return 0;
}

export function hirePaymentRowNetDueGbp(row: HirePaymentScheduleRowInput): number {
  return netRowAmountGbp(row.baseAmountGbp, row.discountTotalGbp);
}

export function hirePaymentRowBalanceGbp(row: HirePaymentScheduleRowInput): number {
  return Math.round((hirePaymentRowNetDueGbp(row) - hirePaymentRowPaidGbp(row)) * 100) / 100;
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
 * Headline rent totals for staff/driver payment UI.
 * Deposit rows are excluded — use the schedule table for deposit status.
 * Accrued rent = periods started on or before today (or contract end when ended).
 */
export function summarizeHirePayments(
  rows: HirePaymentScheduleRowInput[],
  todayYmd: string,
): HirePaymentSummary {
  const enriched = enrichHirePaymentRows(rows, todayYmd);
  let rentGrossAccruedGbp = 0;
  let totalDueGbp = 0;
  let totalPaidGbp = 0;
  let scheduleBalanceGbp = 0;
  let totalDiscountGbp = 0;
  let contractTotalGbp = 0;
  let nextDue: HirePaymentSummary["nextDue"] = null;

  for (const row of enriched) {
    if (row.balanceGbp > 0 && row.paymentStatus !== "pending_approval") {
      scheduleBalanceGbp += row.balanceGbp;
    }

    if (row.rowKind !== "rent") continue;

    contractTotalGbp += row.netDueGbp;
    if (!row.accrued) continue;

    rentGrossAccruedGbp += row.baseAmountGbp;
    totalDiscountGbp += row.discountTotalGbp;
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

  const signedAccruedBalanceGbp = Math.round((totalDueGbp - totalPaidGbp) * 100) / 100;
  const balanceGbp = Math.max(0, signedAccruedBalanceGbp);
  const creditGbp = Math.max(0, -signedAccruedBalanceGbp);

  return {
    rentGrossAccruedGbp: Math.round(rentGrossAccruedGbp * 100) / 100,
    totalDueGbp: Math.round(totalDueGbp * 100) / 100,
    totalPaidGbp: Math.round(totalPaidGbp * 100) / 100,
    balanceGbp,
    creditGbp,
    signedAccruedBalanceGbp,
    scheduleBalanceGbp: Math.round(scheduleBalanceGbp * 100) / 100,
    totalDiscountGbp: Math.round(totalDiscountGbp * 100) / 100,
    contractTotalGbp: Math.round(contractTotalGbp * 100) / 100,
    nextDue,
  };
}
