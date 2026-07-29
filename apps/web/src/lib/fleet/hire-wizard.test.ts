import { describe, expect, it } from "vitest";
import {
  canAdvanceFromDriverAccessStep,
  canAdvanceFromStep,
  driverAccessBlocksFinalize,
  driverAccessLocksContractTerms,
  hireWizardUsesCustomEndTime,
  normalizeDrivingLicence,
  resolveHireWizardEndTime,
  type HireWizardFormState,
} from "@/lib/fleet/hire-wizard";

const baseForm = (): HireWizardFormState => ({
  vehicleId: "",
  startDate: "",
  startTime: "09:00",
  endTime: "09:00",
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

  it("requires end time only for custom contracts", () => {
    const annualOnly = {
      ...baseForm(),
      vehicleId: "v1",
      startDate: "2026-08-01",
      startTime: "09:00",
      endTime: "",
      rentAmountGbp: "150",
      contractLengths: { annual: true, six_months: false, custom: false },
    };
    expect(canAdvanceFromStep(2, annualOnly)).toBeNull();

    const custom = {
      ...annualOnly,
      contractLengths: { annual: false, six_months: false, custom: true },
      customEndDate: "2026-12-31",
      endTime: "",
    };
    expect(canAdvanceFromStep(2, custom)).toMatch(/end time/i);
    expect(canAdvanceFromStep(2, { ...custom, endTime: "17:00" })).toBeNull();
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

describe("resolveHireWizardEndTime", () => {
  it("mirrors start time for annual and 6-month contracts", () => {
    const form = {
      ...baseForm(),
      startTime: "10:30",
      endTime: "17:00",
      contractLengths: { annual: true, six_months: false, custom: false },
    };
    expect(hireWizardUsesCustomEndTime(form)).toBe(false);
    expect(resolveHireWizardEndTime(form)).toBe("10:30");
  });

  it("uses collected end time for custom contracts", () => {
    const form = {
      ...baseForm(),
      startTime: "09:00",
      endTime: "16:45",
      contractLengths: { annual: false, six_months: false, custom: true },
    };
    expect(resolveHireWizardEndTime(form)).toBe("16:45");
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
