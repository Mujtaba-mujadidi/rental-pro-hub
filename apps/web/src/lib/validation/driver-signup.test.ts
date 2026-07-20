import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isExpiryOnOrAfterToday,
  normalizeUkDrivingLicenceNumber,
  normalizeUkPostcode,
  parseUkDate,
  validateDriverAge,
} from "@/lib/validation/driver-signup";

describe("parseUkDate", () => {
  it("parses valid UTC calendar days", () => {
    const d = parseUkDate("2020-01-15");
    expect(d?.getUTCFullYear()).toBe(2020);
    expect(d?.getUTCDate()).toBe(15);
  });

  it("rejects invalid shapes and impossible days", () => {
    expect(parseUkDate("")).toBeNull();
    expect(parseUkDate("15/01/2020")).toBeNull();
    expect(parseUkDate("2020-02-30")).toBeNull();
  });
});

describe("validateDriverAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires 18+", () => {
    expect(validateDriverAge(parseUkDate("2008-07-20")!)).toBe(true);
    expect(validateDriverAge(parseUkDate("2008-07-21")!)).toBe(false);
  });
});

describe("normalizeUkPostcode", () => {
  it("normalizes valid and rejects invalid", () => {
    expect(normalizeUkPostcode("sw1a 1aa")).toBe("SW1A1AA");
    expect(normalizeUkPostcode("")).toBeNull();
    expect(normalizeUkPostcode("not-a-pc")).toBeNull();
  });
});

describe("isExpiryOnOrAfterToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts today and future, rejects past/invalid", () => {
    expect(isExpiryOnOrAfterToday("2026-07-20")).toBe(true);
    expect(isExpiryOnOrAfterToday("2026-07-21")).toBe(true);
    expect(isExpiryOnOrAfterToday("2026-07-19")).toBe(false);
    expect(isExpiryOnOrAfterToday("bad")).toBe(false);
  });
});

describe("normalizeUkDrivingLicenceNumber", () => {
  it("strips spaces and uppercases", () => {
    expect(normalizeUkDrivingLicenceNumber(" ab 12 ")).toBe("AB12");
  });
});
