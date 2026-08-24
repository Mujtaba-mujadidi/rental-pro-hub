import { describe, expect, it } from "vitest";
import {
  buildHireEndedOutstandingBalance,
  buildHireEndedRefundCalculation,
  buildHireEndedSummaryStats,
  formatDriverChargesHint,
  formatRefundPaidHintForAudience,
  formatRentSettledHint,
  hireDepositAppliedToRentGbp,
  hireEndedSettlementChipLabel,
} from "@/lib/fleet/hire-ended-summary-display";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";

function terminationSummary(
  overrides: Partial<HireTerminationAccountsSummary> = {},
): HireTerminationAccountsSummary {
  return {
    activatedAt: "2026-07-29T09:00:00.000Z",
    terminatedAt: "2026-08-08T09:00:00.000Z",
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
    balanceDirection: "driver_owes_company",
    netSettlementGbp: 57.14,
    rentBillingMode: "end_of_period",
    billingPeriodBreakdown: null,
    ...overrides,
  };
}

function payments(overrides: Partial<HirePaymentsPageData> = {}): HirePaymentsPageData {
  return {
    hireGroupId: "g1",
    vehicleVrm: "AB12 CDE",
    driverLabel: "Driver",
    hireStatus: "completed",
    contractEndedYmd: "2026-08-08",
    contractEndedAtLabel: "08/08/2026, 10:00",
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
    settlementBalancePayments: [
      {
        id: "p1",
        amountGbp: 342.86,
        direction: "paid_to_driver",
        paymentCategory: "settlement",
        paidAt: "2026-08-08T12:00:00.000Z",
        paymentMethod: "bank_transfer",
        paymentReference: null,
        paymentAccountId: null,
        paymentAccountName: null,
        notes: null,
      },
    ],
    terminationSummary: terminationSummary(),
    depositDispositionLabel: "Refund full deposit",
    depositDisposition: "refund_full",
    depositPendingReview: false,
    depositGbp: 500,
    depositReceivedGbp: 500,
    accountPosition: null,
    currentSignedSettlementGbp: 0,
    checkinCompleted: true,
    canFinalizeSettlement: true,
    canResolveDeposit: false,
    settlementResolutionLabel: "Paid",
    settlementBreakdown: null,
    driverChargeLineItems: [
      {
        id: "c1",
        chargeType: "damage",
        chargeTypeLabel: "Damage",
        amountGbp: 100,
        resolution: "add_to_balance",
        resolutionLabel: "Added to balance",
        description: "Bumper",
        createdAt: "2026-08-08T11:00:00.000Z",
        chargedOn: "2026-08-08",
        sourceKind: "checkin_inspection_damage",
        canMutate: false,
      },
    ],
    extraChargesOutstandingGbp: 0,
    extraChargePendingPayment: null,
    extraChargeAllocationEvents: [],
    canMutateExtraCharges: false,
    summary: {
      rentGrossAccruedGbp: 200,
      totalDueGbp: 157.14,
      totalPaidGbp: 100,
      balanceGbp: 0,
      creditGbp: 0,
      signedAccruedBalanceGbp: 0,
      scheduleBalanceGbp: 0,
      totalDiscountGbp: 0,
      contractTotalGbp: 3650,
      nextDue: null,
      nextFutureDue: null,
    },
    rows: [],
    paymentAccount: null,
    canSubmitPayment: false,
    canApprovePayments: false,
    canApplyDiscount: false,
    ...overrides,
  };
}

function dashboard(overrides: Partial<HireDashboardData> = {}): HireDashboardData {
  return {
    summary: payments().summary,
    health: {
      level: "on_track",
      headline: "Good",
      detail: "On time",
      onTimePercent: 82,
      onTimeCount: 2,
      eligiblePeriodCount: 2,
      overdueCount: 0,
      overdueTotalGbp: 0,
      pendingApprovalCount: 0,
      rejectedCount: 0,
    },
    attentionItems: [],
    lifecycleAttentionItems: [],
    chartPoints: [],
    lifecycle: {} as HireDashboardData["lifecycle"],
    recentEvents: [],
    includeDeposit: true,
    canTerminate: false,
    settlementBalance: payments().settlementBalance,
    hasPostEndPrepaidPayments: false,
    contractEndedYmd: "2026-08-08",
    contractEndedAtLabel: "08/08/2026, 10:00",
    driverDocumentsRetainUntilLabel: null,
    driverDocumentsRetentionWarning: null,
    depositPendingReview: false,
    depositGbp: 500,
    depositDispositionLabel: "Refund full deposit",
    financialClosure: {} as HireDashboardData["financialClosure"],
    overview: {
      hireGroupId: "g1",
      hireGroupIdShort: "g1",
      vehicleVrm: "AB12 CDE",
      vehicleMakeModel: "Toyota Prius",
      driverName: "Driver",
      driverEmail: null,
      companyName: "OXUS",
      rentLabel: "£100.00 / week",
      rentCadence: "weekly",
      depositLabel: "£500.00",
      contractStartLabel: "29/07/2026, 09:00",
      startDateYmd: "2026-07-29",
      startAtLabel: "29/07/2026, 09:00",
      scheduledEndAtLabel: null,
      endedAtLabel: "08/08/2026, 10:00",
      frequencyPositionLabel: "Week 2 of hire",
      statusLabel: "Hire completed",
      contractEnded: true,
    },
    workspaceHero: {
      contractStartLabel: "29 Jul 2026, 09:00",
      activeSinceLabel: "29 Jul 2026, 09:00",
      contractEndLabel: "8 Aug 2026, 10:00",
      dailyRentLabel: "£100.00",
    },
    terminationSummary: terminationSummary(),
    ...overrides,
  };
}

describe("hire-ended-summary-display", () => {
  it("computes deposit applied to rent only after disposition (not while hold_pending)", () => {
    expect(hireDepositAppliedToRentGbp(terminationSummary(), "hold_pending")).toBe(0);
    expect(hireDepositAppliedToRentGbp(terminationSummary(), "refund_full")).toBe(0);
    expect(hireDepositAppliedToRentGbp(terminationSummary(), "apply_to_balance")).toBe(57.14);
  });

  it("formats rent settled and driver charge hints", () => {
    expect(formatRentSettledHint(100, 57.14)).toBe("£100.00 paid + £57.14 from deposit");
    expect(formatDriverChargesHint(1)).toBe("1 damage charge after check-in");
    expect(formatDriverChargesHint(1, "driver")).toBe("1 charge applied after vehicle return");
    expect(formatRefundPaidHintForAudience(1, "driver")).toBe("Received in 1 bank transfer");
  });

  it("builds driver-facing settled outstanding balance copy", () => {
    const outstanding = buildHireEndedOutstandingBalance(payments(), {
      refundPaidGbp: 342.86,
      audience: "driver",
    });
    expect(outstanding.kicker).toBe("Hire completed");
    expect(outstanding.headline).toBe("You have nothing outstanding");
    expect(outstanding.detail).toContain("your final refund has been paid");
  });

  it("builds settled outstanding balance banner copy", () => {
    const outstanding = buildHireEndedOutstandingBalance(payments(), { refundPaidGbp: 342.86 });
    expect(outstanding.settled).toBe(true);
    expect(outstanding.kicker).toBe("Hire and settlement completed");
    expect(outstanding.headline).toBe("Nothing is currently owed");
    expect(outstanding.detail).toContain("final refund has been paid");
    expect(outstanding.amountGbp).toBe(0);
  });

  it("builds refund calculation from real settlement figures", () => {
    const refund = buildHireEndedRefundCalculation({
      terminationSummary: terminationSummary(),
      driverChargesGbp: 100,
      settlementPaymentsToDriverGbp: 342.86,
      depositDisposition: "refund_full",
      depositReceivedGbp: 500,
    });
    expect(refund).toMatchObject({
      originalDepositGbp: 500,
      rentFromDepositGbp: 0,
      driverChargesGbp: 100,
      advanceRentToRefundGbp: 0,
      advanceRentRefundedGbp: 0,
      depositRefundedGbp: 342.86,
      finalRefundPaidGbp: 342.86,
      visible: true,
    });
  });

  it("ignores unpaid contractual deposit in refund calculation", () => {
    expect(
      buildHireEndedRefundCalculation({
        terminationSummary: terminationSummary({ depositGbp: 400 }),
        driverChargesGbp: 200,
        settlementPaymentsToDriverGbp: 0,
        depositDisposition: "hold_pending",
        depositReceivedGbp: 0,
      }),
    ).toBeNull();
  });

  it("summarises ended hire stat cards from payments data", () => {
    const stats = buildHireEndedSummaryStats({ dashboard: dashboard(), payments: payments() });
    expect(stats.rentSettledGbp).toBe(157.14);
    expect(stats.driverChargesGbp).toBe(100);
    expect(stats.refundPaidGbp).toBe(342.86);
    expect(stats.rentSettledHint).toContain("£100.00 paid");

    const driverStats = buildHireEndedSummaryStats({
      dashboard: dashboard(),
      payments: payments(),
      audience: "driver",
    });
    expect(driverStats.driverChargesHint).toBe("1 charge applied after vehicle return");
    expect(driverStats.refundPaidHint).toBe("Received in 1 bank transfer");
  });

  it("labels settlement chip when balance is settled", () => {
    expect(hireEndedSettlementChipLabel(payments())).toBe("Settlement completed");
  });
});
