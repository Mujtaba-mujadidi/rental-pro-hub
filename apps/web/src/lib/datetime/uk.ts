/**
 * UK (en-GB) date/time display helpers.
 * Use these for all user-facing dates — never rely on the browser default locale.
 *
 * - Calendar dates from DB (`date` / YYYY-MM-DD): {@link formatUkDate}
 * - Timestamps (ISO with time): {@link formatUkDateTime}
 * - Long prose dates: {@link formatUkDateLong}
 */

const LOCALE = "en-GB";

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

/**
 * Short UK date: `17 Jul 2026`.
 * Pass a YYYY-MM-DD string for date-only columns; ISO timestamps also work (local calendar day).
 */
export function formatUkDate(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && !value.includes("T")) {
    const d = parseCalendarDay(value);
    if (!d) return empty;
    return d.toLocaleDateString(LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Long UK date: `17 July 2026` (good for licence expiry / prose). */
export function formatUkDateLong(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && !value.includes("T")) {
    const d = parseCalendarDay(value);
    if (!d) return empty;
    return d.toLocaleDateString(LOCALE, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * UK date + time: `17 Jul 2026, 21:16` (24-hour).
 * Use for created_at / transferred_at / signed_at style timestamps.
 */
export function formatUkDateTime(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * UK date + time with seconds: `17/07/2026, 21:16:42` (24-hour).
 * Prefer for legal / e-sign stamps.
 */
export function formatUkDateTimeSeconds(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
