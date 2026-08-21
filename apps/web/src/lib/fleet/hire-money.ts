/** Safe GBP helpers — store/compute via integer pence to avoid float drift. */

export type GbpPence = number;

export function gbpToPence(gbp: number): GbpPence {
  if (!Number.isFinite(gbp)) return 0;
  return Math.round(gbp * 100);
}

export function penceToGbp(pence: GbpPence): number {
  return Math.round(pence) / 100;
}

export function roundGbp(gbp: number): number {
  return penceToGbp(gbpToPence(gbp));
}

export function addGbp(...values: number[]): number {
  return penceToGbp(values.reduce((sum, value) => sum + gbpToPence(value), 0));
}

export function subGbp(left: number, right: number): number {
  return penceToGbp(gbpToPence(left) - gbpToPence(right));
}

export function maxGbp(left: number, right: number): number {
  return penceToGbp(Math.max(gbpToPence(left), gbpToPence(right)));
}

export function minGbp(left: number, right: number): number {
  return penceToGbp(Math.min(gbpToPence(left), gbpToPence(right)));
}

export function clampNonNegativeGbp(gbp: number): number {
  return maxGbp(0, gbp);
}

/** Absolute values below half a penny are treated as zero. */
export function isZeroGbp(gbp: number): boolean {
  return Math.abs(gbpToPence(gbp)) === 0;
}
