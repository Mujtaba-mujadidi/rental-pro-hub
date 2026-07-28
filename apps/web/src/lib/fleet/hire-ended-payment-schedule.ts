export type HireEndedPaymentScheduleRow = {
  periodStart: string;
  rowKind: string;
  paidGbp: number;
  paymentStatus: string;
  pendingSubmittedGbp?: number | null;
};

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
