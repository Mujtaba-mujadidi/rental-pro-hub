import { describe, expect, it } from "vitest";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import {
  buildHireEndedDepositRefundDisplay,
  buildHireEndedPositionSnapshot,
  buildHireEndedRentCalculation,
  formatEndedChargeCardDisplay,
  formatEndedChargeEvidenceHref,
} from "@/lib/fleet/hire-ended-payments-display";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";

function termination(
  partial: Partial<HireTerminationAccountsSummary>,
): HireTerminationAccountsSummary {
  return {
    activatedAt: "2026-07-29T00:00:00.000Z",
    terminatedAt: "2026-08-08T12:00:00.000Z",
    durationDays: 11,
    billedPeriods: 2,
    rentCadence: "weekly",
    rentAmountGbp: 100,
    accruedRentDueGbp: 157.14,
    accruedRentPaidGbp: 100,
    prepaidRentCreditGbp: 0,
    accruedOverpaymentGbp: 0,
    totalDiscountGbp: 0,
    rentGrossAccruedGbp: 157.14,
    totalDueGbp: 157.14,
    totalPaidGbp: 100,
    balanceGbp: 57.14,
    rentCreditGbp: 0,
    signedRentBalanceGbp: 57.14,
    depositGbp: 500,
    outstandingExtraChargesGbp: 0,
    balanceDirection: "company_owes_driver",
    netSettlementGbp: -442.86,
    rentBillingMode: "actual",
    billingPeriodBreakdown: null,
    ...partial,
  };
}

function payments(
  partial: Partial<HirePaymentsPageData> & {
    terminationSummary?: HireTerminationAccountsSummary | null;
  },
): Pick<
  HirePaymentsPageData,
  | "terminationSummary"
  | "summary"
  | "depositGbp"
  | "settlementBalancePayments"
  | "driverChargeLineItems"
> {
  return {
    terminationSummary: partial.terminationSummary ?? termination({}),
    summary: partial.summary ?? {
      rentGrossAccruedGbp: 200,
      totalDueGbp: 157.14,
      totalPaidGbp: 100,
      balanceGbp: 0,
      creditGbp: 0,
      signedAccruedBalanceGbp: 57.14,
      scheduleBalanceGbp: 0,
      totalDiscountGbp: 0,
      contractTotalGbp: 200,
      nextDue: null,
    },
    depositGbp: partial.depositGbp ?? 500,
    settlementBalancePayments: partial.settlementBalancePayments ?? [],
    driverChargeLineItems: partial.driverChargeLineItems ?? [],
  };
}

describe("buildHireEndedRentCalculation", () => {
  it("shows rent due, paid, deposit applied and zero outstanding", () => {
    const calc = buildHireEndedRentCalculation(payments({}));
    expect(calc.rentDueToEndGbp).toBe(157.14);
    expect(calc.totalRentReceivedDuringHireGbp).toBe(100);
    expect(calc.paymentReceivedDuringHireGbp).toBe(100);
    expect(calc.paidFromDepositGbp).toBe(57.14);
    expect(calc.rentOutstandingGbp).toBe(0);
    expect(calc.advanceRentToRefundGbp).toBe(0);
    expect(calc.advanceRentNote).toBeNull();
    expect(calc.cancelledPeriodNote).toContain("£42.86");
    expect(calc.cancelledPeriodNote).toContain("final week");
  });

  it("keeps accrued rent on the rent card and points advance rent at the refund card", () => {
    const calc = buildHireEndedRentCalculation(
      payments({
        terminationSummary: termination({
          accruedRentDueGbp: 70,
          accruedRentPaidGbp: 70,
          prepaidRentCreditGbp: 330,
          totalPaidGbp: 400,
          signedRentBalanceGbp: -330,
          depositGbp: 300,
        }),
        summary: {
          rentGrossAccruedGbp: 110,
          totalDueGbp: 70,
          totalPaidGbp: 400,
          balanceGbp: 0,
          creditGbp: 330,
          signedAccruedBalanceGbp: 0,
          scheduleBalanceGbp: 0,
          totalDiscountGbp: 0,
          contractTotalGbp: 440,
          nextDue: null,
        },
      }),
    );
    expect(calc.rentDueToEndGbp).toBe(70);
    expect(calc.totalRentReceivedDuringHireGbp).toBe(400);
    expect(calc.paymentReceivedDuringHireGbp).toBe(70);
    expect(calc.advanceRentToRefundGbp).toBe(330);
    expect(calc.advanceRentNote).toContain("£330.00");
    expect(calc.advanceRentNote).toContain("refund card");
  });
});

describe("buildHireEndedDepositRefundDisplay", () => {
  it("builds deposit refund lines with damage and paid refunds", () => {
    const display = buildHireEndedDepositRefundDisplay({
      payments: payments({
        driverChargeLineItems: [
          {
            id: "c1",
            chargeType: "checkin_inspection_damage",
            chargeTypeLabel: "Damage",
            amountGbp: 100,
            resolution: "add_to_balance",
            resolutionLabel: "Deducted from refund",
            description: "Rear bumper scratch",
            createdAt: "2026-08-08T12:33:00.000Z",
            chargedOn: "2026-08-08",
            sourceKind: "checkin_inspection_damage",
            canMutate: false,
          },
        ],
        settlementBalancePayments: [
          {
            id: "p1",
            amountGbp: 100,
            paymentMethod: "bank_transfer",
            paymentReference: null,
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            paidAt: "2026-08-08T13:41:00.000Z",
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
          {
            id: "p2",
            amountGbp: 242.86,
            paymentMethod: "bank_transfer",
            paymentReference: null,
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            paidAt: "2026-08-09T00:04:00.000Z",
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
        ],
      }),
    });

    expect(display?.originalDepositGbp).toBe(500);
    expect(display?.lessUnpaidRentGbp).toBe(57.14);
    expect(display?.lessDamageGbp).toBe(100);
    expect(display?.advanceRentToRefundGbp).toBe(0);
    expect(display?.advanceRentRefundedGbp).toBe(0);
    expect(display?.depositRefundedGbp).toBe(342.86);
    expect(display?.refundPaidToDriverGbp).toBe(342.86);
    expect(display?.refundPaidLabel).toBe("Total refunded to driver");
    expect(display?.refundNote).toContain("£342.86 of the deposit was refunded");
  });

  it("uses driver wording for refund label and note", () => {
    const display = buildHireEndedDepositRefundDisplay({
      audience: "driver",
      payments: payments({
        driverChargeLineItems: [
          {
            id: "c1",
            chargeType: "damage",
            chargeTypeLabel: "Damage",
            amountGbp: 100,
            resolution: "add_to_balance",
            resolutionLabel: "Deducted from refund",
            description: "Rear bumper · scratch · minor",
            createdAt: "2026-08-08T12:33:00.000Z",
            chargedOn: "2026-08-08",
            sourceKind: "checkin_inspection_damage",
            canMutate: false,
          },
        ],
        settlementBalancePayments: [
          {
            id: "p1",
            amountGbp: 200,
            paidAt: "2026-08-09T10:00:00.000Z",
            paymentMethod: "bank_transfer",
            paymentReference: "",
            paymentAccountId: null,
            paymentAccountName: null,
            notes: "Deposit refund",
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
          {
            id: "p2",
            amountGbp: 142.86,
            paidAt: "2026-08-09T11:00:00.000Z",
            paymentMethod: "bank_transfer",
            paymentReference: "",
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
        ],
      }),
    });

    expect(display?.refundPaidLabel).toBe("Total refunded to you");
    expect(display?.refundNote).toContain("£342.86 of your deposit was refunded");
  });

  it("puts unused advance rent on the refund card instead of mixing it with deposit", () => {
    const display = buildHireEndedDepositRefundDisplay({
      payments: payments({
        terminationSummary: termination({
          accruedRentDueGbp: 70,
          accruedRentPaidGbp: 70,
          prepaidRentCreditGbp: 330,
          depositGbp: 300,
          signedRentBalanceGbp: -330,
        }),
        driverChargeLineItems: [
          {
            id: "c1",
            chargeType: "damage",
            chargeTypeLabel: "Damage",
            amountGbp: 100,
            resolution: "paid_now",
            resolutionLabel: "Paid now",
            description: "Front Bonnet · scratch · minor",
            createdAt: "2026-07-28T14:31:00.000Z",
            chargedOn: "2026-07-28",
            sourceKind: "checkin_inspection_damage",
            canMutate: false,
          },
          {
            id: "c2",
            chargeType: "damage",
            chargeTypeLabel: "Damage",
            amountGbp: 200,
            resolution: "add_to_balance",
            resolutionLabel: "Add to balance",
            description: "Left Side Passenger Door · scratch · minor",
            createdAt: "2026-07-28T14:31:00.000Z",
            chargedOn: "2026-07-28",
            sourceKind: "checkin_inspection_damage",
            canMutate: false,
          },
        ],
        settlementBalancePayments: [
          {
            id: "p1",
            amountGbp: 30,
            paidAt: "2026-07-27T22:24:00.000Z",
            paymentMethod: "bank_transfer",
            paymentReference: null,
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
          {
            id: "p2",
            amountGbp: 100,
            paidAt: "2026-07-27T23:03:00.000Z",
            paymentMethod: "bank_transfer",
            paymentReference: "partial refund 2",
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
          {
            id: "p3",
            amountGbp: 200,
            paidAt: "2026-07-27T23:24:00.000Z",
            paymentMethod: "bank_transfer",
            paymentReference: null,
            paymentAccountId: null,
            paymentAccountName: null,
            notes: null,
            direction: "paid_to_driver",
            paymentCategory: "settlement",
          },
        ],
      }),
    });

    expect(display?.advanceRentToRefundGbp).toBe(330);
    expect(display?.advanceRentRefundedGbp).toBe(330);
    expect(display?.depositRefundedGbp).toBe(0);
    expect(display?.refundNote).toContain("£330.00 unused advance rent was refunded");
    expect(display?.refundNote).toContain("3 bank transfers");
    expect(display?.intro).toContain("unused advance rent");
  });
});

describe("buildHireEndedPositionSnapshot", () => {
  it("shows remaining deposit as held, not as a refund due", () => {
    const snapshot = buildHireEndedPositionSnapshot(payments({}));
    expect(snapshot?.rentDueGbp).toBe(157.14);
    expect(snapshot?.rentAppliedGbp).toBe(100);
    expect(snapshot?.totalRentReceivedDuringHireGbp).toBe(100);
    expect(snapshot?.advanceRentToRefundGbp).toBe(0);
    expect(snapshot?.depositAppliedToRentGbp).toBe(57.14);
    expect(snapshot?.depositHeldGbp).toBe(442.86);
    expect(snapshot?.note).toContain("deposit was still held");
    expect(snapshot?.note).not.toContain("refund due");
  });

  it("separates unused advance rent from the held deposit", () => {
    const snapshot = buildHireEndedPositionSnapshot(
      payments({
        terminationSummary: termination({
          accruedRentDueGbp: 70,
          accruedRentPaidGbp: 70,
          prepaidRentCreditGbp: 330,
          totalPaidGbp: 400,
          signedRentBalanceGbp: -330,
          depositGbp: 300,
        }),
        summary: {
          rentGrossAccruedGbp: 110,
          totalDueGbp: 70,
          totalPaidGbp: 400,
          balanceGbp: 0,
          creditGbp: 330,
          signedAccruedBalanceGbp: 0,
          scheduleBalanceGbp: 0,
          totalDiscountGbp: 0,
          contractTotalGbp: 440,
          nextDue: null,
        },
        depositGbp: 300,
      }),
    );
    expect(snapshot?.rentDueGbp).toBe(70);
    expect(snapshot?.totalRentReceivedDuringHireGbp).toBe(400);
    expect(snapshot?.rentAppliedGbp).toBe(70);
    expect(snapshot?.advanceRentToRefundGbp).toBe(330);
    expect(snapshot?.depositHeldGbp).toBe(300);
    expect(snapshot?.note).toContain("£330.00 unused advance rent");
    expect(snapshot?.note).toContain("£300.00 deposit still held");
  });
});

describe("formatEndedChargeCardDisplay", () => {
  it("formats panel · type · severity into title and severity", () => {
    expect(
      formatEndedChargeCardDisplay({
        description: "Rear bumper · scratch · minor",
        chargeTypeLabel: "Damage",
      }),
    ).toEqual({
      title: "Rear bumper scratch",
      severityLabel: "Minor",
    });
  });

  it("falls back to raw description when not structured", () => {
    expect(
      formatEndedChargeCardDisplay({
        description: "Cleaning fee",
        chargeTypeLabel: "Other",
      }),
    ).toEqual({
      title: "Cleaning fee",
      severityLabel: null,
    });
  });
});

describe("formatEndedChargeEvidenceHref", () => {
  it("routes staff and drivers to their check-in workspaces", () => {
    expect(
      formatEndedChargeEvidenceHref("hg1", { chargeType: "damage" }, "staff"),
    ).toBe("/rental/hires/hg1/checkin");
    expect(
      formatEndedChargeEvidenceHref("hg1", { chargeType: "damage" }, "driver"),
    ).toBe("/driver/hires/hg1/checkin");
    expect(
      formatEndedChargeEvidenceHref("hg1", { chargeType: "cleaning" }, "driver"),
    ).toBeNull();
  });
});
