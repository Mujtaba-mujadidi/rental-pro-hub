import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysFromTodayToExpiry,
  formatUkDate,
  formatUkDateLong,
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

  it("formats YYYY-MM-DD as UK short date in UTC", () => {
    expect(formatUkDate("2026-07-17")).toBe("17 Jul 2026");
  });

  it("returns empty for unparseable values", () => {
    expect(formatUkDate("not-a-date")).toBe("—");
    expect(formatUkDate("17/07/2026")).toBe("—");
  });
});

describe("formatUkDateLong", () => {
  it("formats YYYY-MM-DD with long month", () => {
    expect(formatUkDateLong("2026-07-17")).toBe("17 July 2026");
  });

  it("returns empty for null", () => {
    expect(formatUkDateLong(null)).toBe("—");
  });
});

describe("formatUkDateTime", () => {
  it("returns empty for null", () => {
    expect(formatUkDateTime(null)).toBe("—");
  });

  it("formats an ISO instant with 24h time", () => {
    const out = formatUkDateTime("2026-07-17T20:16:00.000Z");
    expect(out).toMatch(/17 Jul 2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
});

describe("formatUkDateTimeSeconds", () => {
  it("returns empty for null", () => {
    expect(formatUkDateTimeSeconds(null)).toBe("—");
  });

  it("includes seconds", () => {
    const out = formatUkDateTimeSeconds("2026-07-17T20:16:42.000Z");
    expect(out).toMatch(/42/);
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
