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
    totalDueGbp: 157.14,
    totalPaidGbp: 100,
    balanceGbp: 57.14,
    rentCreditGbp: 0,
    signedRentBalanceGbp: 57.14,
    depositGbp: 500,
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
    expect(calc.paymentReceivedDuringHireGbp).toBe(100);
    expect(calc.paidFromDepositGbp).toBe(57.14);
    expect(calc.rentOutstandingGbp).toBe(0);
    expect(calc.cancelledPeriodNote).toContain("£42.86");
    expect(calc.cancelledPeriodNote).toContain("final week");
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
    expect(display?.refundPaidToDriverGbp).toBe(342.86);
    expect(display?.refundPaidLabel).toBe("Refund paid to driver");
    expect(display?.refundNote).toContain("2 bank transfers");
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

    expect(display?.refundPaidLabel).toBe("Refund paid to you");
    expect(display?.refundNote).toContain("Your final refund was paid");
  });
});

describe("buildHireEndedPositionSnapshot", () => {
  it("shows refund due before later charges", () => {
    const snapshot = buildHireEndedPositionSnapshot(payments({}));
    expect(snapshot?.rentDueGbp).toBe(157.14);
    expect(snapshot?.rentPaidByDriverGbp).toBe(100);
    expect(snapshot?.depositAppliedToRentGbp).toBe(57.14);
    expect(snapshot?.refundDueBeforeLaterChargesGbp).toBe(442.86);
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
