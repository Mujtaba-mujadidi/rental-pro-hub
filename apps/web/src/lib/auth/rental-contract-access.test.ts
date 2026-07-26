import { describe, expect, it } from "vitest";
import { resolveRentalContractAccess, shouldShowContractChangeRejection } from "@/lib/auth/rental-contract-access";

describe("resolveRentalContractAccess", () => {
  it("blocks new companies until the first agreement is active", () => {
    expect(
      resolveRentalContractAccess({
        contractStatus: "draft",
        onboardingComplete: false,
        hasPendingAmendmentSignature: false,
      }),
    ).toEqual({ contractActive: false, renewalSignaturePending: false });
  });

  it("allows established tenants while an amendment renewal awaits signature", () => {
    expect(
      resolveRentalContractAccess({
        contractStatus: "draft",
        onboardingComplete: true,
        hasPendingAmendmentSignature: true,
      }),
    ).toEqual({ contractActive: true, renewalSignaturePending: true });
  });

  it("treats active contracts as fully active", () => {
    expect(
      resolveRentalContractAccess({
        contractStatus: "active",
        onboardingComplete: true,
        hasPendingAmendmentSignature: false,
      }),
    ).toEqual({ contractActive: true, renewalSignaturePending: false });
  });

  it("recovers access when company record is active but contract row is briefly draft", () => {
    expect(
      resolveRentalContractAccess({
        contractStatus: "draft",
        companyContractStatus: "active",
        onboardingComplete: true,
        hasPendingAmendmentSignature: false,
      }),
    ).toEqual({ contractActive: true, renewalSignaturePending: false });
  });
});

describe("shouldShowContractChangeRejection", () => {
  it("hides rejection after a later signed amendment", () => {
    expect(
      shouldShowContractChangeRejection(
        { reviewed_at: "2026-07-20T10:00:00.000Z" },
        "2026-07-21T12:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("shows rejection when no later signed amendment exists", () => {
    expect(shouldShowContractChangeRejection({ reviewed_at: "2026-07-20T10:00:00.000Z" }, null)).toBe(true);
  });
});
