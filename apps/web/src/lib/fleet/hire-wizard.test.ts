import { describe, expect, it } from "vitest";
import {
  canAdvanceFromDriverAccessStep,
  canAdvanceFromStep,
  driverAccessBlocksFinalize,
  driverAccessLocksContractTerms,
  normalizeDrivingLicence,
  type HireWizardFormState,
} from "@/lib/fleet/hire-wizard";

const baseForm = (): HireWizardFormState => ({
  vehicleId: "",
  startDate: "",
  rentCadence: "weekly",
  rentAmountGbp: "",
  includeDeposit: false,
  depositGbp: "",
  defaultPaymentAccountId: "",
  contractLengths: { annual: false, six_months: false, custom: false },
  customEndDate: "",
  hireTermsVersionId: "",
  driverLicenceNumber: "",
  driverEmail: "",
});

describe("normalizeDrivingLicence", () => {
  it("strips spaces and uppercases", () => {
    expect(normalizeDrivingLicence("ab 12 34567")).toBe("AB1234567");
  });
});

describe("canAdvanceFromStep", () => {
  it("requires vehicle on step 1", () => {
    expect(canAdvanceFromStep(1, baseForm())).toBe("Select a vehicle.");
    expect(canAdvanceFromStep(1, { ...baseForm(), vehicleId: "v1" })).toBeNull();
  });

  it("validates step 2 payment and lengths", () => {
    const f = {
      ...baseForm(),
      vehicleId: "v1",
      startDate: "2026-08-01",
      rentAmountGbp: "150",
      contractLengths: { annual: true, six_months: false, custom: false },
    };
    expect(canAdvanceFromStep(2, f)).toBeNull();
    expect(
      canAdvanceFromStep(2, {
        ...f,
        includeDeposit: true,
        depositGbp: "bad",
      }),
    ).toBe("Enter a valid deposit amount.");
  });

  it("requires driving licence on step 4", () => {
    const f = {
      ...baseForm(),
      vehicleId: "v1",
      startDate: "2026-08-01",
      rentAmountGbp: "150",
      contractLengths: { annual: true, six_months: false, custom: false },
      hireTermsVersionId: "terms-1",
      driverLicenceNumber: "",
    };
    expect(canAdvanceFromStep(4, f)).toMatch(/licence/i);
    expect(canAdvanceFromStep(4, { ...f, driverLicenceNumber: "AB1234567" })).toBeNull();
  });
});

describe("canAdvanceFromDriverAccessStep", () => {
  it("requires approved access", () => {
    expect(canAdvanceFromDriverAccessStep("pending")).toMatch(/approve/i);
    expect(canAdvanceFromDriverAccessStep("approved")).toBeNull();
  });
});

describe("driverAccessBlocksFinalize", () => {
  it("allows e-sign when approved and confirmed", () => {
    expect(driverAccessBlocksFinalize("approved", true)).toBe(false);
  });
  it("blocks when pending", () => {
    expect(driverAccessBlocksFinalize("pending", false)).toBe(true);
  });
});

describe("driverAccessLocksContractTerms", () => {
  it("locks hire terms only after driver approval", () => {
    expect(driverAccessLocksContractTerms("approved")).toBe(true);
    expect(driverAccessLocksContractTerms("pending")).toBe(false);
    expect(driverAccessLocksContractTerms("rejected")).toBe(false);
    expect(driverAccessLocksContractTerms("not_requested")).toBe(false);
  });
});
