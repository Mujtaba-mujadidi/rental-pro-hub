import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysFromTodayToExpiry,
  formatUkCalendarDateTime,
  formatUkDate,
  formatUkDateLong,
  formatUkDateRange,
  formatUkDateTime,
  formatUkDateTimeSeconds,
} from "@/lib/datetime/uk";

describe("formatUkDate", () => {
  it("returns empty placeholder for null/empty", () => {
    expect(formatUkDate(null)).toBe("—");
    expect(formatUkDate(undefined)).toBe("—");
    expect(formatUkDate("")).toBe("—");
    expect(formatUkDate("", "n/a")).toBe("n/a");
  });

  it("formats YYYY-MM-DD as numeric UK date in UTC", () => {
    expect(formatUkDate("2026-07-17")).toBe("17/07/2026");
  });

  it("returns empty for unparseable values", () => {
    expect(formatUkDate("not-a-date")).toBe("—");
    expect(formatUkDate("17/07/2026")).toBe("—");
  });
});

describe("formatUkDateLong", () => {
  it("matches numeric formatUkDate output", () => {
    expect(formatUkDateLong("2026-07-17")).toBe("17/07/2026");
  });

  it("returns empty for null", () => {
    expect(formatUkDateLong(null)).toBe("—");
  });
});

describe("formatUkCalendarDateTime", () => {
  it("formats YYYY-MM-DD with numeric date and 24h time", () => {
    expect(formatUkCalendarDateTime("2027-07-28", "09:00")).toBe("28/07/2027, 09:00");
  });

  it("returns empty for missing date", () => {
    expect(formatUkCalendarDateTime(null, "09:00")).toBe("—");
  });
});

describe("formatUkDateRange", () => {
  it("formats an inclusive range", () => {
    expect(formatUkDateRange("2026-07-01", "2026-07-07")).toBe("01/07/2026 – 07/07/2026");
  });

  it("returns a single date when start and end match", () => {
    expect(formatUkDateRange("2026-07-01", "2026-07-01")).toBe("01/07/2026");
  });
});

describe("formatUkDateTime", () => {
  it("returns empty for null", () => {
    expect(formatUkDateTime(null)).toBe("—");
  });

  it("formats an ISO instant in Europe/London with 24h time", () => {
    // 20:16 UTC in July = 21:16 BST
    expect(formatUkDateTime("2026-07-17T20:16:00.000Z")).toBe("17/07/2026, 21:16");
  });
});

describe("formatUkDateTimeSeconds", () => {
  it("returns empty for null", () => {
    expect(formatUkDateTimeSeconds(null)).toBe("—");
  });

  it("includes seconds in Europe/London", () => {
    expect(formatUkDateTimeSeconds("2026-07-17T20:16:42.000Z")).toBe("17/07/2026, 21:16:42");
  });
});

describe("daysFromTodayToExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for missing/invalid", () => {
    expect(daysFromTodayToExpiry(null)).toBeNull();
    expect(daysFromTodayToExpiry(undefined)).toBeNull();
    expect(daysFromTodayToExpiry("")).toBeNull();
    expect(daysFromTodayToExpiry("not-a-date")).toBeNull();
  });

  it("returns 0 when expiry is today", () => {
    expect(daysFromTodayToExpiry("2026-07-20")).toBe(0);
  });

  it("returns positive days until expiry", () => {
    expect(daysFromTodayToExpiry("2026-07-25")).toBe(5);
  });

  it("returns negative days when expired", () => {
    expect(daysFromTodayToExpiry("2026-07-18")).toBe(-2);
  });

  it("uses only the date portion of longer strings", () => {
    expect(daysFromTodayToExpiry("2026-07-20T23:59:59Z")).toBe(0);
  });
});
