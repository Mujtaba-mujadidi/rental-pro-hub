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

const UK_DATE_TEXT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const UK_DATE_TEXT_LONG: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

const UK_DATETIME_TEXT: Intl.DateTimeFormatOptions = {
  ...UK_DATE_TEXT,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const UK_TIME_ZONE = "Europe/London";

/** Today's calendar date in UK (YYYY-MM-DD) for hire start / fleet status logic. */
export function ukTodayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: UK_TIME_ZONE });
}

function londonDateTimeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function londonWallPartsFromMs(ms: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  const parts = londonDateTimeFormatter().formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  let hour = Number(map.hour);
  const minute = Number(map.minute);
  if (hour === 24) hour = 0;
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute };
}

function londonWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  let ms = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = londonWallPartsFromMs(ms);
    if (!actual) return null;
    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const delta = targetMs - actualMs;
    if (delta === 0) return ms;
    ms += delta;
  }
  const actual = londonWallPartsFromMs(ms);
  if (!actual) return null;
  if (
    actual.year === year &&
    actual.month === month &&
    actual.day === day &&
    actual.hour === hour &&
    actual.minute === minute
  ) {
    return ms;
  }
  return null;
}

/**
 * Parse `YYYY-MM-DD` + `HH:mm` as Europe/London wall time and return a UTC ISO string.
 * Staff-entered return dates/times are always interpreted in UK local time.
 */
export function ukLondonDateTimeToIso(dateYmd: string, timeHm: string): string | null {
  const date = dateYmd.trim();
  const time = timeHm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (hour > 23 || minute > 59) return null;
  const ms = londonWallTimeToUtcMs(year, month, day, hour, minute);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** Current instant as ISO, using the Europe/London wall clock for "now". */
export function ukLondonNowIso(): string {
  const today = ukTodayYmd();
  const timeHm = new Date().toLocaleTimeString("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return ukLondonDateTimeToIso(today, timeHm) ?? new Date().toISOString();
}

/**
 * UK calendar day for hire termination accrual.
 * Prefer the staff-entered return date; otherwise derive from the return instant.
 */
export function resolveUkTerminationAccrualYmd(input: {
  returnDateYmd?: string | null;
  returnedAtIso?: string | null;
}): string {
  const draftDate = input.returnDateYmd?.trim();
  if (draftDate && /^\d{4}-\d{2}-\d{2}$/.test(draftDate)) return draftDate;
  const iso = input.returnedAtIso?.trim();
  if (iso) return ukLondonDayYmd(iso) ?? iso.slice(0, 10);
  return ukTodayYmd();
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

/**
 * UK date + time with short month: `10 Aug 2026, 01:23` (24-hour, Europe/London).
 * Use for hire workspace hero and other compact summary headers.
 */
export function formatUkDateTimeText(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleString(LOCALE, { ...UK_DATETIME_TEXT, timeZone: "Europe/London" });
}

/** Calendar date with short month: `10 Aug 2026`. */
export function formatUkDateText(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && !value.includes("T")) {
    const d = parseCalendarDay(value);
    if (!d) return empty;
    return d.toLocaleDateString(LOCALE, { ...UK_DATE_TEXT, timeZone: "UTC" });
  }
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleDateString(LOCALE, { ...UK_DATE_TEXT, timeZone: "Europe/London" });
}

/** Calendar date with long month: `10 August 2026`. */
export function formatUkDateTextLong(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim()) && !value.includes("T")) {
    const d = parseCalendarDay(value);
    if (!d) return empty;
    return d.toLocaleDateString(LOCALE, { ...UK_DATE_TEXT_LONG, timeZone: "UTC" });
  }
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleDateString(LOCALE, { ...UK_DATE_TEXT_LONG, timeZone: "Europe/London" });
}

/** 24-hour clock time in Europe/London: `09:00`. */
export function formatUkTime(value: string | Date | null | undefined, empty = "—"): string {
  if (value == null || value === "") return empty;
  const d = parseInstant(value);
  if (!d) return empty;
  return d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

/** Europe/London calendar day as `YYYY-MM-DD` for an instant. */
export function ukLondonDayYmd(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = parseInstant(value);
  if (!d) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** Inclusive calendar range with short month: `29 Jul – 8 Aug 2026`. */
export function formatUkDateRangeText(
  startYmd: string | null | undefined,
  endYmd: string | null | undefined,
  empty = "—",
): string {
  const start = formatUkDateText(startYmd, "");
  if (!start) return empty;
  if (!endYmd || endYmd === startYmd) return start;
  const end = formatUkDateText(endYmd, "");
  if (!end) return start;
  return `${start} – ${end}`;
}

/** Calendar date + fixed time with short month: `9 Aug 2027, 09:00`. */
export function formatUkCalendarDateTimeText(
  dateYmd: string | null | undefined,
  time24: string,
  empty = "—",
): string {
  const d = dateYmd?.trim() ? parseCalendarDay(dateYmd) : null;
  if (!d) return empty;
  const datePart = d.toLocaleDateString(LOCALE, { ...UK_DATE_TEXT, timeZone: "UTC" });
  const t = time24.trim();
  return t ? `${datePart}, ${t}` : datePart;
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

/** Whole calendar days from a reference date (YYYY-MM-DD) to expiry; negative if expired. */
export function daysFromCalendarDateToExpiry(
  expiryYmd: string | null | undefined,
  todayYmd: string,
): number | null {
  if (!expiryYmd) return null;
  const exp = parseCalendarDay(expiryYmd.slice(0, 10));
  const today = parseCalendarDay(todayYmd.slice(0, 10));
  if (!exp || !today) return null;
  const diff = utcStartOfDayMs(exp) - utcStartOfDayMs(today);
  return Math.round(diff / 86400000);
}
