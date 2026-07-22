/** Strip to up to 6 sort-code digits. */
export function parseUkSortCodeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** Format digits as UK sort code `XX-XX-XX`. Partial input is formatted progressively. */
export function formatUkSortCode(value: string): string {
  const digits = parseUkSortCodeDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export function splitUkSortCodeParts(value: string | null | undefined): [string, string, string] {
  const digits = parseUkSortCodeDigits(value ?? "");
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
}

export function normalizeUkSortCodeForStorage(value: string | null | undefined): string | null {
  const formatted = formatUkSortCode(value ?? "");
  return formatted || null;
}
