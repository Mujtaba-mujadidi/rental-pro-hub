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
