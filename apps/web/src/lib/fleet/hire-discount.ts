/** Round to 2 decimal places (GBP). */
export function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export type HireDiscountMode = "amount" | "percent";

/**
 * Compute discount GBP from amount or percent of the row net due.
 * Result is capped at the row's outstanding balance.
 */
export function computeHireDiscountGbp(
  mode: HireDiscountMode,
  value: number,
  netDueGbp: number,
  balanceGbp: number,
): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;

  let amountGbp: number;
  if (mode === "amount") {
    amountGbp = roundGbp(value);
  } else {
    if (value > 100) return null;
    amountGbp = roundGbp((netDueGbp * value) / 100);
  }

  if (amountGbp <= 0) return null;
  return roundGbp(Math.min(amountGbp, balanceGbp));
}

export function parseDiscountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/%/g, "").replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
