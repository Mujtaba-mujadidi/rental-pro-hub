import { describe, expect, it } from "vitest";
import { rentalPathRequiresRedirect, type RentalSessionLifecycle } from "@/lib/auth/rental-lifecycle";

const rental = (overrides: Partial<Extract<RentalSessionLifecycle, { kind: "rental" }>> = {}): RentalSessionLifecycle => ({
  kind: "rental",
  companyId: "c1",
  companyName: "Acme",
  deletionPhase: "active",
  contractActive: true,
  onboardingComplete: true,
  ...overrides,
});

describe("rentalPathRequiresRedirect", () => {
  it("allows non-rental sessions anywhere", () => {
    expect(rentalPathRequiresRedirect("/rental", { kind: "not_rental" })).toBeNull();
  });

  it("forces account-closed when access_blocked", () => {
    const ctx = rental({ deletionPhase: "access_blocked" });
    expect(rentalPathRequiresRedirect("/rental", ctx)).toBe("/rental/account-closed");
    expect(rentalPathRequiresRedirect("/rental/account-closed", ctx)).toBeNull();
    expect(rentalPathRequiresRedirect("/rental/account-closed/x", ctx)).toBeNull();
  });

  it("forces offboarding when offboarding", () => {
    const ctx = rental({ deletionPhase: "offboarding" });
    expect(rentalPathRequiresRedirect("/rental", ctx)).toBe("/rental/offboarding");
    expect(rentalPathRequiresRedirect("/rental/offboarding", ctx)).toBeNull();
  });

  it("forces awaiting-contract when contract inactive", () => {
    const ctx = rental({ contractActive: false });
    expect(rentalPathRequiresRedirect("/rental", ctx)).toBe("/rental/awaiting-contract");
    expect(rentalPathRequiresRedirect("/rental/awaiting-contract", ctx)).toBeNull();
  });

  it("leaves awaiting-contract when contract becomes active", () => {
    expect(
      rentalPathRequiresRedirect("/rental/awaiting-contract", rental({ onboardingComplete: true })),
    ).toBe("/rental");
    expect(
      rentalPathRequiresRedirect("/rental/awaiting-contract", rental({ onboardingComplete: false })),
    ).toBe("/rental/onboarding");
  });

  it("forces onboarding when incomplete", () => {
    const ctx = rental({ onboardingComplete: false });
    expect(rentalPathRequiresRedirect("/rental/vehicles", ctx)).toBe("/rental/onboarding");
    expect(rentalPathRequiresRedirect("/rental/onboarding", ctx)).toBeNull();
    expect(rentalPathRequiresRedirect("/login", ctx)).toBeNull();
  });

  it("allows normal rental paths when fully active", () => {
    expect(rentalPathRequiresRedirect("/rental/vehicles", rental())).toBeNull();
  });
});
