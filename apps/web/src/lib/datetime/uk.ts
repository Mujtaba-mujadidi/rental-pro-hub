/**
 * UK (en-GB) date/time display helpers.
 * Use these for all user-facing dates — never rely on the browser default locale.
 *
 * Display style is numeric throughout:
 * - Date: `17/07/2026`
 * - Date + time: `17/07/2026, 21:16`
 * - Date + time + seconds: `17/07/2026, 21:16:42`
 */

const LOCALE = "en-GB";

const UK_DATE_NUMERIC: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const UK_DATETIME_NUMERIC: Intl.DateTimeFormatOptions = {
  ...UK_DATE_NUMERIC,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const UK_DATETIME_SECONDS_NUMERIC: Intl.DateTimeFormatOptions = {
  ...UK_DATETIME_NUMERIC,
  second: "2-digit",
};

/** Today's calendar date in UK (YYYY-MM-DD) for hire start / fleet status logic. */
export function ukTodayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function parseInstant(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a calendar day (YYYY-MM-DD) as UTC so the day never shifts by timezone. */
function parseCalendarDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (!y || !mo || !day) return null;
  const d = new Date(Date.UTC(y, mo - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCalendarDayNumeric(d: Date): string {
  return d.toLocaleDateString(LOCALE, { ...UK_DATE_NUMERIC, timeZone: "UTC" });
}

function formatInstantDateNumeric(d: Date): string {
  return d.toLocaleDateString(LOCALE, { ...UK_DATE_NUMERIC, timeZone: "Europe/London" });
}

/**
 * UK date (numeric): `17/07/2026`.
 * Pass YYYY-MM-DD for date-only columns; ISO timestamps use the Europe/London calendar day.
 */
export function formatUkDate(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && !value.includes("T")) {
    const d = parseCalendarDay(value);
    if (!d) return empty;
    return formatCalendarDayNumeric(d);
  }
  const d = parseInstant(value);
  if (!d) return empty;
  return formatInstantDateNumeric(d);
}

/**
 * Numeric UK date — same output as {@link formatUkDate}.
 * Kept for call sites that distinguish “long” display intent (e.g. licence expiry).
 */
export function formatUkDateLong(value: string | Date | null | undefined, empty = "—"): string {
  return formatUkDate(value, empty);
}

/** Calendar date + fixed time: `17/07/2026, 09:00`. */
export function formatUkDateAtTime(
  dateYmd: string | null | undefined,
  time24: string,
  empty = "—",
): string {
  return formatUkCalendarDateTime(dateYmd, time24, empty);
}

/** Calendar date + fixed time: `17/07/2026, 09:00`. */
export function formatUkCalendarDateTime(
  dateYmd: string | null | undefined,
  time24: string,
  empty = "—",
): string {
  const datePart = formatUkDate(dateYmd, "");
  if (!datePart) return empty;
  const t = time24.trim();
  return t ? `${datePart}, ${t}` : datePart;
}

/** Inclusive calendar range: `01/07/2026 – 07/07/2026`. */
export function formatUkDateRange(
  startYmd: string | null | undefined,
  endYmd: string | null | undefined,
  empty = "—",
): string {
  const start = formatUkDate(startYmd, "");
  if (!start) return empty;
  if (!endYmd || endYmd === startYmd) return start;
  const end = formatUkDate(endYmd, "");
  if (!end) return start;
  return `${start} – ${end}`;
}

/**
 * UK date + time (numeric): `17/07/2026, 21:16` (24-hour, Europe/London).
 * Use for created_at / transferred_at / signed_at style timestamps.
 */
export function formatUkDateTime(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleString(LOCALE, { ...UK_DATETIME_NUMERIC, timeZone: "Europe/London" });
}

/**
 * UK date + time with seconds: `17/07/2026, 21:16:42` (24-hour).
 * Prefer for legal / e-sign stamps.
 */
export function formatUkDateTimeSeconds(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleString(LOCALE, { ...UK_DATETIME_SECONDS_NUMERIC, timeZone: "Europe/London" });
}

function utcStartOfDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole calendar days from today (UTC) to expiry date; negative if expired. */
export function daysFromTodayToExpiry(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const exp = parseCalendarDay(isoDate.slice(0, 10));
  if (!exp) return null;
  const today = new Date();
  const diff = utcStartOfDayMs(exp) - utcStartOfDayMs(today);
  return Math.round(diff / 86400000);
}
