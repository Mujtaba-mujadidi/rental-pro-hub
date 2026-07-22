export type HireIncomeRow = {
  paymentStatus: string;
  approvedAmountGbp: number | null;
  baseAmountGbp: number;
  discountTotalGbp: number;
};

function netDue(row: HireIncomeRow): number {
  return Math.max(0, Math.round((row.baseAmountGbp - row.discountTotalGbp) * 100) / 100);
}

/** Sum approved hire income for P&L (uses approved amount or net due). */
export function sumApprovedHireIncomeGbp(rows: HireIncomeRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.paymentStatus !== "approved") continue;
    const amount =
      row.approvedAmountGbp != null && row.approvedAmountGbp >= 0
        ? row.approvedAmountGbp
        : netDue(row);
    total += amount;
  }
  return Math.round(total * 100) / 100;
}
