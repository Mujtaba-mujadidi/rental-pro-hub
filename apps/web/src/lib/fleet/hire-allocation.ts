export type AllocatableRow = {
  id: string;
  netAmountGbp: number;
  paymentStatus: "not_received" | "pending_approval" | "rejected" | "approved";
  sortOrder: number;
};

export type AllocationResult = {
  rowId: string;
  allocatedGbp: number;
};

/** Allocate a lump sum to oldest unpaid rows (by sort order). */
export function allocateLumpSumToRows(
  amountGbp: number,
  rows: AllocatableRow[],
): AllocationResult[] {
  if (amountGbp <= 0 || !rows.length) return [];

  const eligible = rows
    .filter((r) => r.paymentStatus !== "approved")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let remaining = Math.round(amountGbp * 100) / 100;
  const out: AllocationResult[] = [];

  for (const row of eligible) {
    if (remaining <= 0) break;
    const need = row.netAmountGbp;
    if (need <= 0) continue;
    const alloc = Math.min(remaining, need);
    out.push({ rowId: row.id, allocatedGbp: alloc });
    remaining = Math.round((remaining - alloc) * 100) / 100;
  }

  return out;
}
