import type { HirePaymentRowComputed } from "@/lib/fleet/hire-payment-summary";
import {
  terminationRentDueForRow,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";
import type { RentCadence } from "@/lib/fleet/hire-types";

export type HireEndedPaymentScheduleRow = {
  periodStart: string;
  periodEnd?: string;
  rowKind: string;
  paidGbp: number;
  paymentStatus: string;
  pendingSubmittedGbp?: number | null;
};

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Align schedule row due amounts with termination billing (e.g. pro-rata final week). */
export function adjustEndedContractPaymentRowDues<T extends HirePaymentRowComputed>(
  rows: readonly T[],
  contractEndedYmd: string,
  billingMode: HireTerminationRentBillingMode,
  rentCadence: RentCadence,
): T[] {
  const endedYmd = contractEndedYmd.trim();
  if (!endedYmd) return [...rows];

  return rows.map((row) => {
    if (row.rowKind !== "rent") return row;
    const netDueGbp = terminationRentDueForRow(row, endedYmd, billingMode, rentCadence);
    if (Math.abs(netDueGbp - row.netDueGbp) < 0.005) return row;
    const balanceGbp = roundGbp(Math.max(0, netDueGbp - row.paidGbp));
    return {
      ...row,
      netDueGbp,
      balanceGbp,
      paymentStatus: balanceGbp <= 0.005 ? "approved" : row.paymentStatus,
    };
  });
}

/** Through contract end, plus post-end rows with prepaid/submitted amounts (refund expected). */
export function filterPaymentScheduleForEndedContract<T extends HireEndedPaymentScheduleRow>(
  rows: readonly T[],
  contractEndedYmd: string,
): T[] {
  const endedYmd = contractEndedYmd.trim();
  if (!endedYmd) return [...rows];

  return rows.filter((row) => {
    if (row.rowKind === "deposit") return true;
    if (row.periodStart <= endedYmd) return true;
    if (row.paidGbp > 0.005) return true;
    if (row.paymentStatus === "approved" || row.paymentStatus === "pending_approval") return true;
    if ((row.pendingSubmittedGbp ?? 0) > 0.005) return true;
    return false;
  });
}

export function hasPostEndPrepaidRows<T extends HireEndedPaymentScheduleRow>(
  rows: readonly T[],
  contractEndedYmd: string,
): boolean {
  const endedYmd = contractEndedYmd.trim();
  if (!endedYmd) return false;
  return rows.some(
    (row) =>
      row.rowKind !== "deposit" &&
      row.periodStart > endedYmd &&
      (row.paidGbp > 0.005 ||
        row.paymentStatus === "approved" ||
        row.paymentStatus === "pending_approval" ||
        (row.pendingSubmittedGbp ?? 0) > 0.005),
  );
}

export type HireScheduleRefundMark = "refunded" | "partial";

type HireScheduleRefundMarkRow = {
  id: string;
  rowKind: string;
  periodStart: string;
  paidGbp: number;
};

/**
 * Allocate company refunds onto schedule rows: prepaid post-end rent first (period order),
 * then remaining cash onto the deposit row.
 */
export function buildHireScheduleRefundMarksByRowId(
  rows: readonly HireScheduleRefundMarkRow[],
  contractEndedYmd: string | null | undefined,
  refunds: { prepaidRentRefundedGbp: number; depositRefundedGbp?: number },
): Map<string, HireScheduleRefundMark> {
  const marks = new Map<string, HireScheduleRefundMark>();
  const endedYmd = contractEndedYmd?.trim() || "";
  let prepaidPool = roundGbp(Math.max(0, refunds.prepaidRentRefundedGbp));

  if (endedYmd && prepaidPool > 0.005) {
    const prepaidRows = rows
      .filter(
        (row) =>
          row.rowKind !== "deposit" && row.periodStart > endedYmd && row.paidGbp > 0.005,
      )
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id));

    for (const row of prepaidRows) {
      if (prepaidPool <= 0.005) break;
      const allocated = roundGbp(Math.min(prepaidPool, row.paidGbp));
      prepaidPool = roundGbp(prepaidPool - allocated);
      if (allocated >= row.paidGbp - 0.005) marks.set(row.id, "refunded");
      else if (allocated > 0.005) marks.set(row.id, "partial");
    }
  }

  const depositRefundedGbp = roundGbp(Math.max(0, refunds.depositRefundedGbp ?? 0));
  if (depositRefundedGbp > 0.005) {
    const deposit = rows.find((row) => row.rowKind === "deposit");
    if (deposit && deposit.paidGbp > 0.005) {
      if (depositRefundedGbp >= deposit.paidGbp - 0.005) marks.set(deposit.id, "refunded");
      else marks.set(deposit.id, "partial");
    }
  }

  return marks;
}
