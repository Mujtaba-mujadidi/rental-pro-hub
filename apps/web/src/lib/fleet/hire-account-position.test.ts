import { describe, expect, it } from "vitest";
import {
  buildHireAccountPosition,
  buildHireAccountPositionFromTerminationSummary,
  hireAccountOpenAmountGbp,
  hireAccountSignedOpenGbp,
  hireSettlementCacheFromPosition,
} from "@/lib/fleet/hire-account-position";
import { addGbp, gbpToPence, penceToGbp, roundGbp } from "@/lib/fleet/hire-money";
import { overallTerminationPositionGbp } from "@/lib/fleet/hire-termination-summary";

describe("hire-money", () => {
  it("rounds via integer pence", () => {
    expect(gbpToPence(10.005)).toBe(1001);
    expect(penceToGbp(1001)).toBe(10.01);
    expect(roundGbp(0.1 + 0.2)).toBe(0.3);
    expect(addGbp(57.14, 100, 185.72)).toBe(342.86);
  });
});

describe("buildHireAccountPosition — active hire golden case", () => {
  const position = buildHireAccountPosition({
    lifecycle: "active",
    depositRequiredGbp: 100,
    depositReceivedGbp: 100,
    rentGrossChargedGbp: 80,
    rentDiscountGbp: 3,
    rentPaidConfirmedGbp: 22,
    extraChargesPostedGbp: 100,
    extraChargePaymentsConfirmedGbp: 10,
  });

  it("keeps deposit received out of driver-owes and rent income side", () => {
    expect(position.depositRequiredGbp).toBe(100);
    expect(position.depositReceivedGbp).toBe(100);
    expect(position.depositOutstandingGbp).toBe(0);
    expect(position.depositAvailableGbp).toBe(100);
    expect(position.depositAppliedTotalGbp).toBe(0);
    expect(position.depositHeldSeparately).toBe(true);
  });

  it("computes rent and extras outstanding without using deposit", () => {
    expect(position.rentChargedGbp).toBe(77);
    expect(position.rentPaidGbp).toBe(22);
    expect(position.rentOutstandingGbp).toBe(55);
    expect(position.extraChargesPostedGbp).toBe(100);
    expect(position.extraChargePaymentsGbp).toBe(10);
    expect(position.extraChargesOutstandingGbp).toBe(90);
    expect(position.amountDriverOwesCompanyGbp).toBe(145);
    expect(position.totalToCollectGbp).toBe(145);
    expect(position.accountDirection).toBe("driver_owes_company");
  });

  it("does not treat pending money as reducing the confirmed balance", () => {
    const withPending = buildHireAccountPosition({
      lifecycle: "active",
      depositRequiredGbp: 100,
      depositReceivedGbp: 100,
      rentGrossChargedGbp: 80,
      rentDiscountGbp: 3,
      rentPaidConfirmedGbp: 22,
      extraChargesPostedGbp: 100,
      extraChargePaymentsConfirmedGbp: 10,
      pendingPaymentsGbp: 50,
    });
    expect(withPending.amountDriverOwesCompanyGbp).toBe(145);
    expect(withPending.pendingPaymentsGbp).toBe(50);
  });
});

describe("buildHireAccountPosition — open final account with unpaid deposit", () => {
  const position = buildHireAccountPosition({
    lifecycle: "ended",
    depositRequiredGbp: 400,
    depositReceivedGbp: 0,
    rentGrossChargedGbp: 400,
    rentDiscountGbp: 0,
    rentPaidConfirmedGbp: 0,
    extraChargesPostedGbp: 200,
    extraChargePaymentsConfirmedGbp: 0,
    settlementReceivedFromDriverGbp: 100,
  });

  it("does not allocate or refund an unpaid deposit", () => {
    expect(position.depositRequiredGbp).toBe(400);
    expect(position.depositReceivedGbp).toBe(0);
    expect(position.depositOutstandingGbp).toBe(400);
    expect(position.depositAvailableGbp).toBe(0);
    expect(position.depositAppliedTotalGbp).toBe(0);
    expect(position.refundCalculatedGbp).toBe(0);
    expect(position.refundPaidGbp).toBe(0);
  });

  it("owes charges net of approved payment; unpaid deposit does not affect end-of-hire collect", () => {
    expect(position.totalConfirmedChargesGbp).toBe(600);
    expect(position.amountDriverOwesCompanyGbp).toBe(500);
    expect(position.depositOutstandingGbp).toBe(400);
    expect(position.totalToCollectGbp).toBe(500);
    expect(position.accountDirection).toBe("driver_owes_company");
  });
});

describe("buildHireAccountPosition — fully settled hire", () => {
  const position = buildHireAccountPosition({
    lifecycle: "completed",
    depositRequiredGbp: 500,
    depositReceivedGbp: 500,
    rentGrossChargedGbp: 157.14,
    rentDiscountGbp: 0,
    rentPaidConfirmedGbp: 100,
    extraChargesPostedGbp: 100,
    extraChargePaymentsConfirmedGbp: 0,
    depositAppliedToRentGbp: 57.14,
    depositAppliedToChargesGbp: 100,
    refundCalculatedGbp: 342.86,
    refundPaidGbp: 342.86,
  });

  it("applies deposit formally and settles after full refund paid", () => {
    expect(position.totalConfirmedChargesGbp).toBe(257.14);
    expect(position.rentOutstandingGbp).toBe(0);
    expect(position.extraChargesOutstandingGbp).toBe(0);
    expect(position.depositAppliedToRentGbp).toBe(57.14);
    expect(position.depositAppliedToChargesGbp).toBe(100);
    expect(position.depositAvailableGbp).toBe(0);
    expect(position.refundCalculatedGbp).toBe(342.86);
    expect(position.refundPaidGbp).toBe(342.86);
    expect(position.refundOutstandingGbp).toBe(0);
    expect(position.amountDriverOwesCompanyGbp).toBe(0);
    expect(position.amountCompanyOwesDriverGbp).toBe(0);
    expect(position.accountDirection).toBe("settled");
    expect(position.accountStatus).toBe("fully_settled");
    expect(hireAccountOpenAmountGbp(position)).toBe(0);
  });

  it("treats company→driver refunds as refund paid, not driver receipts", () => {
    // Four transfers totalling 342.86 are modelled as refundPaidGbp, not settlement received.
    expect(position.confirmedPaymentsGbp).toBe(
      addGbp(100, 0, 0, 500), // rent paid + extras paid + settlement received + deposit received
    );
    expect(position.refundPaidGbp).toBe(342.86);
  });
});

describe("buildHireAccountPosition — edge cases", () => {
  it("handles no deposit required", () => {
    const position = buildHireAccountPosition({
      lifecycle: "active",
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      rentGrossChargedGbp: 50,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 20,
      extraChargesPostedGbp: 0,
      extraChargePaymentsConfirmedGbp: 0,
    });
    expect(position.depositOutstandingGbp).toBe(0);
    expect(position.amountDriverOwesCompanyGbp).toBe(30);
  });

  it("handles partially received deposit", () => {
    const position = buildHireAccountPosition({
      lifecycle: "active",
      depositRequiredGbp: 100,
      depositReceivedGbp: 40,
      rentGrossChargedGbp: 0,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 0,
      extraChargesPostedGbp: 0,
      extraChargePaymentsConfirmedGbp: 0,
    });
    expect(position.depositOutstandingGbp).toBe(60);
    expect(position.depositAvailableGbp).toBe(40);
    expect(position.totalToCollectGbp).toBe(60);
  });

  it("handles refund calculated but unpaid", () => {
    const position = buildHireAccountPosition({
      lifecycle: "completed",
      depositRequiredGbp: 500,
      depositReceivedGbp: 500,
      rentGrossChargedGbp: 157.14,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 100,
      extraChargesPostedGbp: 100,
      extraChargePaymentsConfirmedGbp: 0,
      depositAppliedToRentGbp: 57.14,
      depositAppliedToChargesGbp: 100,
      refundCalculatedGbp: 342.86,
      refundPaidGbp: 250,
    });
    expect(position.refundOutstandingGbp).toBe(92.86);
    expect(position.amountCompanyOwesDriverGbp).toBe(92.86);
    expect(position.accountDirection).toBe("company_owes_driver");
    expect(position.accountStatus).toBe("refund_pending");
  });

  it("never applies more deposit than received", () => {
    const position = buildHireAccountPosition({
      lifecycle: "ended",
      depositRequiredGbp: 100,
      depositReceivedGbp: 0,
      rentGrossChargedGbp: 80,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 0,
      extraChargesPostedGbp: 50,
      extraChargePaymentsConfirmedGbp: 0,
      depositAppliedToRentGbp: 80,
      depositAppliedToChargesGbp: 50,
    });
    expect(position.depositAppliedTotalGbp).toBe(0);
    expect(position.rentOutstandingGbp).toBe(80);
    expect(position.extraChargesOutstandingGbp).toBe(50);
  });

  it("keeps future rent out of current outstanding", () => {
    const position = buildHireAccountPosition({
      lifecycle: "active",
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      rentGrossChargedGbp: 70,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 70,
      rentFutureGbp: 200,
      extraChargesPostedGbp: 0,
      extraChargePaymentsConfirmedGbp: 0,
    });
    expect(position.rentOutstandingGbp).toBe(0);
    expect(position.futureRentGbp).toBe(200);
    expect(position.amountDriverOwesCompanyGbp).toBe(0);
  });

  it("caps deposit applied totals to deposit received", () => {
    const position = buildHireAccountPosition({
      lifecycle: "ended",
      depositRequiredGbp: 100,
      depositReceivedGbp: 100,
      rentGrossChargedGbp: 80,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 0,
      extraChargesPostedGbp: 50,
      extraChargePaymentsConfirmedGbp: 0,
      depositAppliedToRentGbp: 80,
      depositAppliedToChargesGbp: 50,
    });
    expect(position.depositAppliedToRentGbp).toBe(80);
    expect(position.depositAppliedToChargesGbp).toBe(20);
    expect(position.depositAppliedTotalGbp).toBe(100);
  });
});

describe("buildHireAccountPosition — f547-style end hire", () => {
  it("matches rent 400 + damages 200 − paid_now 100 = driver owes 500; unpaid deposit ignored", () => {
    const position = buildHireAccountPosition({
      lifecycle: "completed",
      depositRequiredGbp: 400,
      depositReceivedGbp: 0,
      rentGrossChargedGbp: 400,
      rentDiscountGbp: 0,
      rentPaidConfirmedGbp: 0,
      extraChargesPostedGbp: 200,
      extraChargePaymentsConfirmedGbp: 100,
    });
    expect(position.totalConfirmedChargesGbp).toBe(600);
    expect(position.extraChargesOutstandingGbp).toBe(100);
    expect(position.amountDriverOwesCompanyGbp).toBe(500);
    expect(position.totalToCollectGbp).toBe(500);
    expect(position.depositOutstandingGbp).toBe(400);
    expect(hireSettlementCacheFromPosition(position)).toEqual({
      settlementBalanceGbp: 500,
      settlementBalanceDirection: "driver_owes_company",
    });
  });
});

describe("termination summary → account position (hold_pending)", () => {
  it("matches overall termination position for rent + extras with deposit held", () => {
    const summary = {
      rentGrossAccruedGbp: 110,
      accruedRentDueGbp: 106,
      totalDiscountGbp: 4,
      accruedRentPaidGbp: 27,
      prepaidRentCreditGbp: 0,
      accruedOverpaymentGbp: 0,
      depositGbp: 100,
      signedRentBalanceGbp: 79,
      outstandingExtraChargesGbp: 190,
      netSettlementGbp: 79,
    };
    const position = buildHireAccountPositionFromTerminationSummary(summary, {
      depositDisposition: "hold_pending",
      lifecycle: "ended",
    });
    expect(position.rentOutstandingGbp).toBe(79);
    expect(position.extraChargesOutstandingGbp).toBe(190);
    expect(position.depositAvailableGbp).toBe(100);
    expect(position.depositAppliedTotalGbp).toBe(0);
    expect(position.amountDriverOwesCompanyGbp).toBe(269);
    expect(hireAccountSignedOpenGbp(position)).toBe(269);
    expect(overallTerminationPositionGbp(summary)).toBe(269);
    expect(hireSettlementCacheFromPosition(position)).toEqual({
      settlementBalanceGbp: 269,
      settlementBalanceDirection: "driver_owes_company",
    });
  });
});
