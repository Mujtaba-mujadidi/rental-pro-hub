import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import {
  enrichHirePaymentRows,
  summarizeHirePayments,
  type HirePaymentRowComputed,
  type HirePaymentScheduleRowInput,
  type HirePaymentSummary,
} from "@/lib/fleet/hire-payment-summary";
import type { HireDepositDisposition } from "@/lib/fleet/hire-termination-summary";

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rent schedule credit from deposit at contract end (matches deposit retention / settlement math).
 * Zero when deposit is held pending or rent is already settled on the sheet.
 */
export function depositRentScheduleCreditGbp(input: {
  disposition: HireDepositDisposition | string | null | undefined;
  depositGbp: number;
  signedRentBalanceGbp: number;
  depositRefundAmountGbp?: number | null;
}): number {
  const disposition = String(input.disposition ?? "").trim() as HireDepositDisposition;
  const owed = Math.max(0, roundGbp(input.signedRentBalanceGbp));
  const deposit = Math.max(0, roundGbp(input.depositGbp));
  if (owed <= 0 || deposit <= 0) return 0;
  if (!disposition || disposition === "hold_pending") return 0;

  if (disposition === "apply_to_balance" || disposition === "forfeit") {
    return roundGbp(Math.min(deposit, owed));
  }

  if (disposition === "refund_full") {
    // Net settlement already offsets outstanding rent by the deposit; align the schedule for display.
    return roundGbp(Math.min(deposit, owed));
  }

  if (disposition === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, Number(input.depositRefundAmountGbp ?? 0)));
    const retained = roundGbp(deposit - refund);
    return roundGbp(Math.min(retained, owed));
  }

  return 0;
}

/** Apply a deposit rent credit across accrued rent rows (display / reconciliation). */
export function applyDepositCreditToEnrichedRows(
  rows: readonly HirePaymentRowComputed[],
  creditGbp: number,
  accrualYmd: string,
): HirePaymentRowComputed[] {
  const credit = roundGbp(creditGbp);
  if (credit <= 0) return [...rows];

  const inputs: HirePaymentScheduleRowInput[] = rows.map((row) => ({
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

  const allocation = allocatePaymentAcrossRows(credit, inputs, accrualYmd, { accruedOnly: true });
  const allocById = new Map(allocation.allocations.map((line) => [line.rowId, line.allocatedGbp]));

  return rows.map((row) => {
    const allocated = allocById.get(row.id) ?? 0;
    if (allocated <= 0) return row;
    const paidGbp = roundGbp(row.paidGbp + allocated);
    const balanceGbp = roundGbp(row.netDueGbp - paidGbp);
    return {
      ...row,
      paidGbp,
      balanceGbp,
      paymentStatus: balanceGbp <= 0.005 ? "approved" : row.paymentStatus,
    };
  });
}

/**
 * When a ended hire applied deposit to rent at termination but the schedule was not updated,
 * reconcile summary + rows for staff/driver UI.
 */
export function reconcileEndedHirePaymentsWithDepositCredit(input: {
  rows: readonly HirePaymentRowComputed[];
  summary: HirePaymentSummary;
  disposition: HireDepositDisposition | string | null | undefined;
  terminationSummary: {
    depositGbp: number;
    signedRentBalanceGbp: number;
    accruedRentPaidGbp?: number;
  };
  depositRefundAmountGbp?: number | null;
  accrualYmd: string;
}): { rows: HirePaymentRowComputed[]; summary: HirePaymentSummary } {
  const credit = depositRentScheduleCreditGbp({
    disposition: input.disposition,
    depositGbp: input.terminationSummary.depositGbp,
    signedRentBalanceGbp: input.terminationSummary.signedRentBalanceGbp,
    depositRefundAmountGbp: input.depositRefundAmountGbp,
  });
  const rentPaidOnSchedule = roundGbp(
    input.rows
      .filter((row) => row.rowKind === "rent")
      .reduce((sum, row) => sum + row.paidGbp, 0),
  );
  const accruedRentPaidGbp = roundGbp(input.terminationSummary.accruedRentPaidGbp ?? 0);
  const creditAlreadyOnSchedule = roundGbp(Math.max(0, rentPaidOnSchedule - accruedRentPaidGbp));
  const remainingCredit = roundGbp(Math.max(0, credit - creditAlreadyOnSchedule));

  if (remainingCredit <= 0.005 || input.summary.balanceGbp <= 0.005) {
    return { rows: [...input.rows], summary: input.summary };
  }

  const adjustedRows = applyDepositCreditToEnrichedRows(input.rows, remainingCredit, input.accrualYmd);
  const rentInputs: HirePaymentScheduleRowInput[] = adjustedRows.map((row) => ({
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

  return {
    rows: adjustedRows,
    summary: summarizeHirePayments(rentInputs, input.accrualYmd),
  };
}

export function enrichedRowsFromScheduleInputs(
  rows: readonly HirePaymentScheduleRowInput[],
  todayYmd: string,
): HirePaymentRowComputed[] {
  return enrichHirePaymentRows([...rows], todayYmd);
}
