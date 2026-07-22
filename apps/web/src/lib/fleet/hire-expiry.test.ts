import { describe, expect, it } from "vitest";
import { isContractExpiringSoon } from "@/lib/fleet/hire-expiry";

describe("isContractExpiringSoon", () => {
  it("true inside window", () => {
    expect(isContractExpiringSoon("2026-08-15", "2026-07-22", 28)).toBe(true);
  });

  it("false when past end", () => {
    expect(isContractExpiringSoon("2026-07-01", "2026-07-22", 28)).toBe(false);
  });

  it("false when beyond window", () => {
    expect(isContractExpiringSoon("2026-12-01", "2026-07-22", 28)).toBe(false);
  });
});
