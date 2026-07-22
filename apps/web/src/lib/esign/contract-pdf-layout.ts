/** Shared layout constants for contract PDF body vs per-page paraph signature strips. */

export const CONTRACT_PAGE_H = 841.89;
export const CONTRACT_MARGIN_TOP = 52;
export const CONTRACT_MARGIN_BOTTOM = 56;
export const CONTRACT_PARAPH_STRIP_H = 34;

/** Minimum vertical band reserved for the repeating letterhead (logo + contact). */
export const CONTRACT_LETTERHEAD_MIN_H = 44;

export function formatContractLetterheadContactLine(parts: {
  companyNumber?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const segments: string[] = [];
  const num = parts.companyNumber?.trim();
  if (num) segments.push(`Co. No. ${num}`);
  const email = parts.email?.trim();
  if (email) segments.push(email);
  const phone = parts.phone?.trim();
  if (phone) segments.push(phone);
  return segments.join("  ·  ");
}

/** Space between footer rule and bottom of paraph strip. */
export const CONTRACT_PARAPH_ABOVE_FOOTER = 8;
/** Minimum clear gap between last body text line and top of paraph strip. */
export const CONTRACT_BODY_CLEARANCE_ABOVE_PARAPH = 56;

/** Bottom edge of paraph strip (PDF y, points from page bottom). */
export function contractParaphStripBottomY(): number {
  return CONTRACT_MARGIN_BOTTOM + CONTRACT_PARAPH_ABOVE_FOOTER;
}

/** Top edge of paraph strip (PDF y, points from page bottom). */
export function contractParaphStripTopY(): number {
  return contractParaphStripBottomY() + CONTRACT_PARAPH_STRIP_H;
}

/** Body text must not extend below this y (PDF coords, from page bottom). */
export function contractContentBottomReserve(): number {
  return contractParaphStripTopY() + CONTRACT_BODY_CLEARANCE_ABOVE_PARAPH;
}

/** Distance from page top to top of paraph strip (for norm-rect field placement). */
export function contractParaphStripTopFromPageTop(): number {
  return CONTRACT_PAGE_H - contractParaphStripTopY();
}
