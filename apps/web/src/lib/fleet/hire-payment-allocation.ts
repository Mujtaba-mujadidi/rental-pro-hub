import {
  enrichHirePaymentRows,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";

export type HirePaymentAllocationLine = {
  rowId: string;
  periodStart: string;
  periodEnd: string;
  rowKind: "rent" | "deposit";
  allocatedGbp: number;
  rowBalanceBeforeGbp: number;
  rowBalanceAfterGbp: number;
  /** True when this payment covers the row's remaining balance in full. */
  fullyAllocated: boolean;
};

export type HirePaymentAllocationResult = {
  allocations: HirePaymentAllocationLine[];
  unallocatedGbp: number;
  totalOutstandingGbp: number;
};

export type AllocatePaymentOptions = {
  /** When true, only rows whose period has started are eligible (legacy accrued-only). */
  accruedOnly?: boolean;
};

/**
 * Pour a single payment amount across schedule rows with outstanding balance (FIFO).
 * By default includes future periods so lump-sum payments can prepay the sheet.
 */
export function allocatePaymentAcrossRows(
  paymentAmountGbp: number,
  rows: HirePaymentScheduleRowInput[],
  todayYmd: string,
  options?: AllocatePaymentOptions,
): HirePaymentAllocationResult {
  const amount = Math.round(Math.max(0, paymentAmountGbp) * 100) / 100;
  const accruedOnly = options?.accruedOnly ?? false;
  const enriched = enrichHirePaymentRows(rows, todayYmd).filter(
    (row) =>
      row.balanceGbp > 0 &&
      row.paymentStatus !== "pending_approval" &&
      (accruedOnly ? row.accrued : true),
  );

  let remaining = amount;
  const allocations: HirePaymentAllocationLine[] = [];
  let totalOutstandingGbp = 0;

  for (const row of enriched) {
    totalOutstandingGbp += row.balanceGbp;
    if (remaining <= 0) continue;

    const allocatedGbp = Math.min(remaining, row.balanceGbp);
    remaining = Math.round((remaining - allocatedGbp) * 100) / 100;
    const rowBalanceAfterGbp = Math.round((row.balanceGbp - allocatedGbp) * 100) / 100;
    allocations.push({
      rowId: row.id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      rowKind: row.rowKind,
      allocatedGbp,
      rowBalanceBeforeGbp: row.balanceGbp,
      rowBalanceAfterGbp,
      fullyAllocated: rowBalanceAfterGbp <= 0,
    });
  }

  return {
    allocations,
    unallocatedGbp: Math.round(remaining * 100) / 100,
    totalOutstandingGbp: Math.round(totalOutstandingGbp * 100) / 100,
  };
}
