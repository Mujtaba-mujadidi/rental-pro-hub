import { describe, expect, it } from "vitest";
import {
  expiryFromStartOrOverride,
  expiryOneYearFromDate,
  formatGbp,
  isMaintenanceCategory,
  MAINTENANCE_CATEGORIES,
  motExpiryFromTestDate,
  normalizeRequiresAccount,
  paymentMethodRequiresAccount,
} from "@/lib/fleet/maintenance";

describe("isMaintenanceCategory", () => {
  it("accepts every known category", () => {
    for (const c of MAINTENANCE_CATEGORIES) {
      expect(isMaintenanceCategory(c)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isMaintenanceCategory("")).toBe(false);
    expect(isMaintenanceCategory("MOT")).toBe(false);
    expect(isMaintenanceCategory("fuel")).toBe(false);
  });
});

describe("formatGbp", () => {
  it("formats GBP with en-GB currency", () => {
    expect(formatGbp(54.85)).toMatch(/£54\.85/);
    expect(formatGbp(0)).toMatch(/£0\.00/);
  });
});

describe("normalizeRequiresAccount", () => {
  it("is false for Cash regardless of flag", () => {
    expect(normalizeRequiresAccount("Cash", true)).toBe(false);
    expect(normalizeRequiresAccount(" cash ", true)).toBe(false);
    expect(normalizeRequiresAccount("Cash", false)).toBe(false);
    expect(normalizeRequiresAccount("Cash", null)).toBe(false);
  });

  it("is false when requires_account is false", () => {
    expect(normalizeRequiresAccount("Card", false)).toBe(false);
  });

  it("is true for non-cash when flag is true or undefined", () => {
    expect(normalizeRequiresAccount("Card", true)).toBe(true);
    expect(normalizeRequiresAccount("Bank transfer", undefined)).toBe(true);
    expect(normalizeRequiresAccount("Bank transfer", null)).toBe(true);
  });
});

describe("paymentMethodRequiresAccount", () => {
  it("defaults to requiring account when method is missing", () => {
    expect(paymentMethodRequiresAccount(null)).toBe(true);
    expect(paymentMethodRequiresAccount(undefined)).toBe(true);
  });

  it("delegates to normalizeRequiresAccount", () => {
    expect(paymentMethodRequiresAccount({ name: "Cash", requires_account: true })).toBe(false);
    expect(paymentMethodRequiresAccount({ name: "Card", requires_account: true })).toBe(true);
  });
});

describe("expiryOneYearFromDate", () => {
  it("adds one calendar year", () => {
    expect(expiryOneYearFromDate("2026-07-19")).toBe("2027-07-19");
    expect(expiryOneYearFromDate("2024-02-29")).toBe("2025-03-01");
  });

  it("returns null for invalid dates", () => {
    expect(expiryOneYearFromDate("")).toBeNull();
    expect(expiryOneYearFromDate("2026-13-01")).toBeNull();
    expect(expiryOneYearFromDate("19/07/2026")).toBeNull();
    expect(expiryOneYearFromDate("2026-02-30")).toBeNull();
  });
});

describe("expiryFromStartOrOverride", () => {
  it("uses override when provided", () => {
    expect(expiryFromStartOrOverride("2026-07-19", "2028-01-01")).toBe("2028-01-01");
    expect(expiryFromStartOrOverride("2026-07-19", " 2028-01-01 ")).toBe("2028-01-01");
  });

  it("falls back to start + 1 year when override empty", () => {
    expect(expiryFromStartOrOverride("2026-07-19", null)).toBe("2027-07-19");
    expect(expiryFromStartOrOverride("2026-07-19", "")).toBe("2027-07-19");
    expect(expiryFromStartOrOverride("2026-07-19", "   ")).toBe("2027-07-19");
    expect(expiryFromStartOrOverride("2026-07-19")).toBe("2027-07-19");
  });

  it("returns null when start is invalid and no override", () => {
    expect(expiryFromStartOrOverride("bad")).toBeNull();
  });
});

describe("motExpiryFromTestDate", () => {
  it("aliases expiryOneYearFromDate", () => {
    expect(motExpiryFromTestDate("2026-07-19")).toBe(expiryOneYearFromDate("2026-07-19"));
  });
});
