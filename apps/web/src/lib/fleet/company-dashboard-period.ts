import { formatUkDateRange } from "@/lib/datetime/uk";
import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";

export const COMPANY_DASHBOARD_PERIOD_KINDS = [
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "custom",
] as const;

export type CompanyDashboardPeriodKind = (typeof COMPANY_DASHBOARD_PERIOD_KINDS)[number];

export const COMPANY_DASHBOARD_PERIOD_OPTIONS: { value: CompanyDashboardPeriodKind; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export const COMPANY_DASHBOARD_ALL_SUBCOMPANIES = "all";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_CUSTOM_DAYS = 366;

export type CompanyDashboardPeriod = {
  kind: CompanyDashboardPeriodKind;
  startYmd: string;
  endYmd: string;
  previousStartYmd: string;
  previousEndYmd: string;
  label: string;
  rangeLabel: string;
  comparisonLabel: string;
};

export function isCompanyDashboardPeriodKind(value: string): value is CompanyDashboardPeriodKind {
  return (COMPANY_DASHBOARD_PERIOD_KINDS as readonly string[]).includes(value);
}

export function isCalendarYmd(value: string): boolean {
  const m = YMD_RE.exec(value.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function ymdParts(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addCalendarDaysYmd(ymd: string, days: number): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function firstOfMonth(ymd: string): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  return toYmd(p.y, p.m, 1);
}

function lastOfMonth(ymd: string): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  return toYmd(p.y, p.m, daysInMonth(p.y, p.m));
}

function addMonthsYmd(ymd: string, delta: number): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1 + delta, 1));
  const last = daysInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, Math.min(p.d, last));
}

function firstOfQuarter(ymd: string): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  const qMonth = Math.floor((p.m - 1) / 3) * 3 + 1;
  return toYmd(p.y, qMonth, 1);
}

function firstOfYear(ymd: string): string | null {
  const p = ymdParts(ymd);
  if (!p) return null;
  return toYmd(p.y, 1, 1);
}

function previousEquivalentWindow(startYmd: string, endYmd: string): { start: string; end: string } | null {
  const days = calendarDaysInclusive(startYmd, endYmd);
  if (days <= 0) return null;
  const prevEnd = addCalendarDaysYmd(startYmd, -1);
  if (!prevEnd) return null;
  const prevStart = addCalendarDaysYmd(prevEnd, -(days - 1));
  if (!prevStart) return null;
  return { start: prevStart, end: prevEnd };
}

function periodKindLabel(kind: CompanyDashboardPeriodKind): string {
  return COMPANY_DASHBOARD_PERIOD_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

export type ResolveCompanyDashboardPeriodInput = {
  kind: string;
  todayYmd: string;
  customStartYmd?: string | null;
  customEndYmd?: string | null;
};

export function resolveCompanyDashboardPeriod(
  input: ResolveCompanyDashboardPeriodInput,
): CompanyDashboardPeriod | { error: string } {
  const today = input.todayYmd.trim();
  if (!isCalendarYmd(today)) return { error: "Invalid reporting date." };

  const kindRaw = input.kind.trim() || "this_month";
  if (!isCompanyDashboardPeriodKind(kindRaw)) return { error: "Unknown reporting period." };

  let startYmd: string | null = null;
  let endYmd: string | null = null;

  if (kindRaw === "this_month") {
    startYmd = firstOfMonth(today);
    endYmd = today;
  } else if (kindRaw === "last_month") {
    const thisFirst = firstOfMonth(today);
    const prevMonthDay = thisFirst ? addCalendarDaysYmd(thisFirst, -1) : null;
    startYmd = prevMonthDay ? firstOfMonth(prevMonthDay) : null;
    endYmd = prevMonthDay ? lastOfMonth(prevMonthDay) : null;
  } else if (kindRaw === "this_quarter") {
    startYmd = firstOfQuarter(today);
    endYmd = today;
  } else if (kindRaw === "this_year") {
    startYmd = firstOfYear(today);
    endYmd = today;
  } else {
    const from = (input.customStartYmd ?? "").trim();
    const to = (input.customEndYmd ?? "").trim();
    if (!isCalendarYmd(from) || !isCalendarYmd(to)) {
      return { error: "Enter a valid custom start and end date." };
    }
    if (from > to) return { error: "Custom period start must be on or before the end date." };
    if (to > today) return { error: "Custom period cannot end after today." };
    const days = calendarDaysInclusive(from, to);
    if (days > MAX_CUSTOM_DAYS) return { error: "Custom period cannot exceed 366 days." };
    startYmd = from;
    endYmd = to;
  }

  if (!startYmd || !endYmd || startYmd > endYmd) {
    return { error: "Could not resolve the reporting period." };
  }

  const previous = previousEquivalentWindow(startYmd, endYmd);
  if (!previous) return { error: "Could not resolve the comparison period." };

  const rangeLabel = formatUkDateRange(startYmd, endYmd);
  return {
    kind: kindRaw,
    startYmd,
    endYmd,
    previousStartYmd: previous.start,
    previousEndYmd: previous.end,
    label: periodKindLabel(kindRaw),
    rangeLabel,
    comparisonLabel: "vs last period",
  };
}

/** YYYY-MM keys covering each calendar month that overlaps [startYmd, endYmd]. */
export function monthKeysOverlappingRange(startYmd: string, endYmd: string): string[] {
  if (!isCalendarYmd(startYmd) || !isCalendarYmd(endYmd) || startYmd > endYmd) return [];
  const keys: string[] = [];
  let cursor = firstOfMonth(startYmd);
  const endMonth = firstOfMonth(endYmd);
  if (!cursor || !endMonth) return [];
  while (cursor <= endMonth) {
    keys.push(cursor.slice(0, 7));
    cursor = addMonthsYmd(cursor, 1);
    if (!cursor) break;
    cursor = firstOfMonth(cursor) ?? cursor;
  }
  return keys;
}

/** Last `count` calendar months ending at the month that contains `endYmd`. */
export function lastMonthKeysEndingAt(endYmd: string, count: number): string[] {
  if (!isCalendarYmd(endYmd) || count <= 0) return [];
  const endMonth = firstOfMonth(endYmd);
  if (!endMonth) return [];
  const start = addMonthsYmd(endMonth, -(count - 1));
  if (!start) return [];
  return monthKeysOverlappingRange(firstOfMonth(start) ?? start, lastOfMonth(endYmd) ?? endYmd);
}

/**
 * Trend buckets: full year/quarter use months in the selected window.
 * Single-month presets use six months ending at the period end so the chart stays comparable.
 */
export function chartMonthKeysForPeriod(period: CompanyDashboardPeriod): string[] {
  if (period.kind === "this_year" || period.kind === "this_quarter") {
    return monthKeysOverlappingRange(period.startYmd, period.endYmd);
  }
  if (period.kind === "custom") {
    const keys = monthKeysOverlappingRange(period.startYmd, period.endYmd);
    return keys.length >= 2 ? keys : lastMonthKeysEndingAt(period.endYmd, 6);
  }
  return lastMonthKeysEndingAt(period.endYmd, 6);
}

export function monthKeyFromYmd(ymd: string): string | null {
  if (!isCalendarYmd(ymd)) return null;
  return ymd.slice(0, 7);
}

export function monthBucketLabel(yearMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!m) return yearMonth;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}
