import { describe, expect, it } from "vitest";
import {
  buildHirePaymentStatementContent,
  hirePaymentStatementFileName,
} from "@/lib/fleet/hire-payment-statement";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";

function termination(): HireTerminationAccountsSummary {
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
  };
}

function minimalPage(overrides: Partial<HirePaymentsPageData> = {}): HirePaymentsPageData {
  return {
    hireGroupId: "g1",
    vehicleVrm: "KE18 FSX",
    driverLabel: "Driver",
    hireStatus: "completed",
    contractEndedYmd: "2026-08-08",
    contractEndedAtLabel: "08/08/2026, 12:00",
    driverDocumentsRetainUntilLabel: null,
    driverDocumentsRetentionWarning: null,
    scheduleShowsEndedContractOnly: true,
    hasPostEndPrepaidPayments: false,
    scheduleReadOnly: true,
    settlementBalance: {
      settlementDirection: "settled",
      openBalanceGbp: 0,
      settled: true,
    },
    canRecordSettlementPayment: false,
    settlementPaymentAccounts: [],
    defaultSettlementPaymentAccountId: null,
    settlementBalancePayments: [],
    terminationSummary: termination(),
    depositDispositionLabel: "Refund full deposit",
    depositDisposition: "refund_full",
    settlementResolutionLabel: null,
    currentSignedSettlementGbp: 0,
    settlementBreakdown: null,
    canFinalizeSettlement: false,
    depositGbp: 500,
    depositReceivedGbp: 500,
    accountPosition: null,
    depositPendingReview: false,
    canResolveDeposit: false,
    checkinCompleted: true,
    driverChargeLineItems: [],
    extraChargesOutstandingGbp: 0,
    extraChargePendingPayment: null,
    canMutateExtraCharges: false,
    rows: [
      {
        id: "d1",
        periodStart: "2026-07-29",
        periodEnd: "2026-07-29",
        periodLabel: "Deposit",
        rowKind: "deposit",
        baseAmountGbp: 500,
        discountTotalGbp: 0,
        paymentStatus: "approved",
        approvedAmountGbp: 500,
        pendingSubmittedGbp: null,
        sortOrder: 0,
        netDueGbp: 500,
        paidGbp: 500,
        balanceGbp: 0,
        accrued: true,
        discounts: [],
      },
    ],
    summary: {
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
      nextFutureDue: null,
    },
    paymentAccount: null,
    canSubmitPayment: false,
    canApprovePayments: false,
    canApplyDiscount: false,
    ...overrides,
  };
}

describe("hirePaymentStatementFileName", () => {
  it("builds a stable download name from VRM and end date", () => {
    expect(hirePaymentStatementFileName({ vehicleVrm: "KE18 FSX", contractEndedYmd: "2026-08-08" })).toBe(
      "hire-payment-statement-KE18-FSX-2026-08-08.pdf",
    );
  });
});

describe("buildHirePaymentStatementContent", () => {
  it("includes rent, deposit and schedule sections", () => {
    const content = buildHirePaymentStatementContent(minimalPage());
    expect(content.fileName).toContain("KE18-FSX");
    expect(content.sections.map((s) => s.heading)).toEqual(
      expect.arrayContaining([
        "Outstanding balance",
        "Rent calculation",
        "Deposit and refund",
        "Full rent schedule",
      ]),
    );
    const rent = content.sections.find((s) => s.heading === "Rent calculation");
    expect(rent?.lines.some((line) => line.includes("£157.14"))).toBe(true);
  });

  it("uses driver wording when requested", () => {
    const content = buildHirePaymentStatementContent(minimalPage(), { audience: "driver" });
    const rent = content.sections.find((s) => s.heading === "Rent calculation");
    expect(rent?.lines.some((line) => line.startsWith("Total rent applied to this hire:"))).toBe(true);
    const deposit = content.sections.find((s) => s.heading === "Deposit and refund");
    expect(deposit?.lines.some((line) => line.startsWith("Original deposit:"))).toBe(true);
    const position = content.sections.find((s) => s.heading === "Position when your hire ended");
    expect(position?.lines.some((line) => line.startsWith("Total rent applied to this hire:"))).toBe(true);
    expect(position?.lines.some((line) => line.startsWith("Deposit held:"))).toBe(true);
  });
});
