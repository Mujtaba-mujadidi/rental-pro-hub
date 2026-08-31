import { describe, expect, it } from "vitest";
import {
  buildActiveHireAccountPosition,
  buildEndedHireAccountPosition,
} from "@/lib/fleet/hire-account-adapters";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";

function termination(
  overrides: Partial<HireTerminationAccountsSummary> = {},
): HireTerminationAccountsSummary {
  return {
    activatedAt: "2026-08-01T00:00:00.000Z",
    terminatedAt: "2026-08-20T12:00:00.000Z",
    durationDays: 20,
    billedPeriods: 3,
    rentBilledDurationDays: 20,
    rentBilledPeriods: 3,
    rentCadence: "weekly",
    rentAmountGbp: 140,
    accruedRentDueGbp: 400,
    accruedRentPaidGbp: 0,
    prepaidRentCreditGbp: 0,
    accruedOverpaymentGbp: 0,
    totalDiscountGbp: 0,
    rentGrossAccruedGbp: 400,
    totalDueGbp: 400,
    totalPaidGbp: 0,
    balanceGbp: 400,
    rentCreditGbp: 0,
    signedRentBalanceGbp: 400,
    depositGbp: 400,
    outstandingExtraChargesGbp: 100,
    balanceDirection: "driver_owes_company",
    netSettlementGbp: 400,
    rentBillingMode: "actual",
    billingPeriodBreakdown: null,
    ...overrides,
  };
}

describe("hire-account-adapters", () => {
  it("active currently due matches deposit + rent + extras", () => {
    const position = buildActiveHireAccountPosition({
      depositRequiredGbp: 100,
      depositReceivedGbp: 0,
      rentChargedAfterDiscountGbp: 200,
      rentPaidConfirmedGbp: 150,
      extraChargesOutstandingGbp: 25,
    });
    expect(position.totalToCollectGbp).toBe(175);
    expect(position.depositOutstandingGbp).toBe(100);
    expect(position.rentOutstandingGbp).toBe(50);
    expect(position.extraChargesOutstandingGbp).toBe(25);
  });

  it("ended KE18-style unpaid deposit ignores deposit; driver owes rent + unpaid extras", () => {
    const position = buildEndedHireAccountPosition({
      terminationSummary: termination(),
      depositDisposition: "hold_pending",
      depositReceivedGbp: 0,
      extraChargesOutstandingGbp: 100,
      extraChargesPostedGbp: 200,
      extraChargePaymentsConfirmedGbp: 100,
      lifecycle: "ended",
    });
    expect(position.amountDriverOwesCompanyGbp).toBe(500);
    // Fact only — unpaid deposit is not collected after end (totalToCollect excludes it).
    expect(position.depositOutstandingGbp).toBe(400);
    expect(position.totalToCollectGbp).toBe(500);
    expect(position.refundCalculatedGbp).toBe(0);
  });
});
