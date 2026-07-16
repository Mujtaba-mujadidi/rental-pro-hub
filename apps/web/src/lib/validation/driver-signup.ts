export const MIN_DRIVER_AGE_YEARS = 18;

/** Parse YYYY-MM-DD from date input; returns null if invalid. */
export function parseUkDate(raw: string): Date | null {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function validateDriverAge(dobUtc: Date): boolean {
  const today = new Date();
  const cutoff = new Date(
    Date.UTC(
      today.getUTCFullYear() - MIN_DRIVER_AGE_YEARS,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  return dobUtc <= cutoff;
}

/** Normalise UK postcode to compact uppercase, or null if empty/invalid shape. */
export function normalizeUkPostcode(raw: string): string | null {
  const compact = raw.replace(/\s/g, "").toUpperCase();
  if (!compact) return null;
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return null;
  return compact;
}

/** Expiry date string YYYY-MM-DD must be on or after today (UTC). */
export function isExpiryOnOrAfterToday(isoDate: string): boolean {
  const d = parseUkDate(isoDate);
  if (!d) return false;
  const today = new Date();
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return d.getTime() >= start;
}

/** Strip spaces and uppercase for storage (no strict DVLA format check). */
export function normalizeUkDrivingLicenceNumber(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

export const DRIVING_LICENCE_NUMBER_MAX_LEN = 32;

export const UK_DRIVING_LICENCE_NUMBER_HINT =
  "Required. Enter the number as on your photocard (e.g. first line only if you prefer); spaces are optional.";
