import { describe, expect, it } from "vitest";
import {
  isRentalCompanyWriteFrozenPhase,
  RENTAL_COMPANY_DATA_FROZEN_MESSAGE,
} from "@/lib/auth/rental-company-write-guard";

describe("isRentalCompanyWriteFrozenPhase", () => {
  it("freezes offboarding and access_blocked only", () => {
    expect(isRentalCompanyWriteFrozenPhase("offboarding")).toBe(true);
    expect(isRentalCompanyWriteFrozenPhase("access_blocked")).toBe(true);
    expect(isRentalCompanyWriteFrozenPhase("active")).toBe(false);
    expect(isRentalCompanyWriteFrozenPhase(null)).toBe(false);
    expect(isRentalCompanyWriteFrozenPhase(undefined)).toBe(false);
    expect(isRentalCompanyWriteFrozenPhase("")).toBe(false);
  });

  it("exposes a frozen message constant", () => {
    expect(RENTAL_COMPANY_DATA_FROZEN_MESSAGE).toMatch(/offboarding/i);
  });
});
