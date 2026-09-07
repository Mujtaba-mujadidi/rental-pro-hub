import { describe, expect, it } from "vitest";
import {
  buildHireEndedConfirmedCalculation,
  hireEndedPendingChargeReviewNote,
  hireEndedPendingReviewBannerLine,
  sumHireEndedPendingChargeProposedGbp,
} from "./hire-ended-balance-overview";
import type { HireEndedPendingReviewsSummary } from "./hire-ended-balance-case";
import type { HireTerminationAccountsSummary } from "./hire-termination-summary";
import {
  hirePendingReturnReviewResolveGate,
  parseHirePendingReturnReviewAmountGbp,
  parseHirePendingReturnReviewDecision,
  parseHirePendingReturnReviewId,
} from "./hire-pending-return-review-resolve";

const pendingWithCharges: HireEndedPendingReviewsSummary = {
  depositPending: true,
  depositHeldGbp: 600,
  charges: [
    {
      id: "d1",
      kind: "damage",
      label: "Bonnet",
      detail: null,
      proposedGbp: 250,
      evidenceHref: null,
    },
    {
      id: "fuel-review",
      kind: "fuel",
      label: "Fuel",
      detail: null,
      proposedGbp: 40,
      evidenceHref: null,
    },
  ],
};

describe("hire-ended-balance-overview", () => {
  it("sums proposed pending charge amounts", () => {
    expect(sumHireEndedPendingChargeProposedGbp(pendingWithCharges)).toBe(290);
  });

  it("builds pending review banner line with projected total", () => {
    expect(
      hireEndedPendingReviewBannerLine({
        pendingReviews: pendingWithCharges,
        openBalanceGbp: 760,
      }),
    ).toBe("£290.00 awaiting review · projected balance if approved £1,050.00");
  });

  it("includes unposted return charges in confirmed totals and splits funding", () => {
    const termination: HireTerminationAccountsSummary = {
      activatedAt: "2026-07-29T00:00:00.000Z",
      terminatedAt: "2026-08-08T12:00:00.000Z",
      durationDays: 11,
      billedPeriods: 2,
      rentBilledDurationDays: 11,
      rentBilledPeriods: 2,
      rentCadence: "weekly",
      rentAmountGbp: 350,
      accruedRentDueGbp: 655,
      accruedRentPaidGbp: 55,
      prepaidRentCreditGbp: 0,
      accruedOverpaymentGbp: 0,
      totalDiscountGbp: 0,
      rentGrossAccruedGbp: 655,
      totalDueGbp: 655,
      totalPaidGbp: 55,
      balanceGbp: 600,
      rentCreditGbp: 0,
      signedRentBalanceGbp: 600,
      depositGbp: 1200,
      outstandingExtraChargesGbp: 50,
      balanceDirection: "driver_owes_company",
      netSettlementGbp: 600,
      rentBillingMode: "end_of_period",
      billingPeriodBreakdown: null,
    };
    const calc = buildHireEndedConfirmedCalculation({
      terminationSummary: termination,
      summary: {
        rentGrossAccruedGbp: 655,
        totalDueGbp: 655,
        totalPaidGbp: 55,
        balanceGbp: 600,
        creditGbp: 0,
        signedAccruedBalanceGbp: 600,
        scheduleBalanceGbp: 600,
        totalDiscountGbp: 0,
        contractTotalGbp: 655,
        nextDue: null,
        nextFutureDue: null,
      },
      depositDisposition: "hold_pending",
      depositReceivedGbp: 600,
      driverChargeLineItems: [
        {
          id: "extra-1",
          chargeType: "admin",
          chargeTypeLabel: "Admin",
          amountGbp: 280,
          resolution: "add_to_balance",
          resolutionLabel: "Added to balance",
          description: "PCN",
          createdAt: "2026-08-01T10:00:00.000Z",
          chargedOn: "2026-08-01",
          sourceKind: "staff_manual",
          canMutate: false,
        },
      ],
      unpostedReturnCharges: [
        { id: "unposted-1", label: "Rear bonnet scratch", amountGbp: 100 },
        { id: "unposted-2", label: "Driver-door dent", amountGbp: 200 },
        { id: "unposted-3", label: "Missing Tyre key / locks", amountGbp: 100 },
      ],
      settlementBalance: {
        settlementDirection: "driver_owes_company",
        openBalanceGbp: 1050,
        settled: false,
      },
      settlementBalancePayments: [
        {
          id: "rcpt",
          amountGbp: 230,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
          paidAt: "2026-08-02T10:00:00.000Z",
          paymentMethod: "bank_transfer",
          paymentReference: null,
          paymentAccountId: null,
          paymentAccountName: null,
          notes: null,
        },
      ],
      pendingReviews: {
        depositPending: true,
        depositHeldGbp: 600,
        charges: [
          {
            id: "fuel-review",
            kind: "fuel",
            label: "Fuel shortfall",
            detail: null,
            proposedGbp: null,
            evidenceHref: null,
          },
        ],
      },
      currentSignedSettlementGbp: 1050,
    });

    expect(calc.totalConfirmedChargesGbp).toBe(1335);
    expect(calc.chargeRows.map((row) => row.id)).toEqual(["rent", "existing-extras", "return-charges"]);
    expect(calc.chargeRows.find((row) => row.id === "return-charges")?.value).toBe("+£400.00");
    expect(calc.fundingAppliedGbp).toBe(285);
    expect(calc.fundingRows.map((row) => row.id)).toEqual(["rent-received", "extra-receipts"]);
    expect(calc.pendingReviewNote).toBe(
      "One return item still needs review. The confirmed balance may change once that decision is made.",
    );
    expect(calc.confirmedBalanceGbp).toBe(1050);
  });

  it("builds a plural pending-review footnote", () => {
    expect(
      hireEndedPendingChargeReviewNote({
        depositPending: false,
        depositHeldGbp: 0,
        charges: [
          {
            id: "a",
            kind: "fuel",
            label: "Fuel",
            detail: null,
            proposedGbp: null,
            evidenceHref: null,
          },
          {
            id: "b",
            kind: "accessory",
            label: "Accessory",
            detail: null,
            proposedGbp: null,
            evidenceHref: null,
          },
        ],
      }),
    ).toBe(
      "2 return items still need review. The confirmed balance may change once those decisions are made.",
    );
    expect(hireEndedPendingChargeReviewNote({ depositPending: true, depositHeldGbp: 100, charges: [] })).toBeNull();
  });
});

describe("hirePendingReturnReviewResolveGate", () => {
  it("denies viewers without rentals.write", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: false,
        hireStatus: "terminated",
      }),
    ).toBe("You do not have permission.");
  });

  it("denies active hires", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "active",
      }),
    ).toMatch(/after the contract has ended/);
  });

  it("allows terminated and completed hires with write access", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "terminated",
      }),
    ).toBeNull();
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "completed",
      }),
    ).toBeNull();
  });

  it("denies when End hire reviews are still locked", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "terminated",
        reviewsLockedUntilEndHireFinalized: true,
      }),
    ).toMatch(/End hire finalisation/);
  });
});

describe("parseHirePendingReturnReviewId", () => {
  it("parses fuel, accessory, and damage ids", () => {
    expect(parseHirePendingReturnReviewId("fuel-review")).toEqual({ kind: "fuel" });
    expect(parseHirePendingReturnReviewId("accessory-hasSpareTyre")).toEqual({
      kind: "accessory",
      key: "hasSpareTyre",
    });
    expect(parseHirePendingReturnReviewId("accessory-nope")).toBeNull();
    expect(parseHirePendingReturnReviewId("not-a-uuid")).toBeNull();
    expect(
      parseHirePendingReturnReviewId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    ).toEqual({
      kind: "damage",
      damageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });
});

describe("parseHirePendingReturnReviewDecision / amount", () => {
  it("accepts approve and waive only", () => {
    expect(parseHirePendingReturnReviewDecision("approve")).toBe("approve");
    expect(parseHirePendingReturnReviewDecision("waive")).toBe("waive");
    expect(parseHirePendingReturnReviewDecision("reject")).toBeNull();
  });

  it("requires a positive amount on approve", () => {
    expect(parseHirePendingReturnReviewAmountGbp("waive", null)).toEqual({
      ok: true,
      amountGbp: null,
    });
    expect(parseHirePendingReturnReviewAmountGbp("approve", 0).ok).toBe(false);
    expect(parseHirePendingReturnReviewAmountGbp("approve", 25.5)).toEqual({
      ok: true,
      amountGbp: 25.5,
    });
  });
});
