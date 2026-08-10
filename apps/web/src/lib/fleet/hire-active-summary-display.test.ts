import { describe, expect, it } from "vitest";
import {
  buildActiveHirePaymentPosition,
  buildActiveHirePaymentRatingDisplay,
  depositRowFromPayments,
  formatAmountDueChip,
  resolveActiveHirePaymentRatingLevel,
} from "@/lib/fleet/hire-active-summary-display";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";

function dashboard(overrides: Partial<HireDashboardData> = {}): HireDashboardData {
  return {
    summary: {
      rentGrossAccruedGbp: 10,
      totalDueGbp: 10,
      totalPaidGbp: 0,
      balanceGbp: 10,
      creditGbp: 0,
      signedAccruedBalanceGbp: 10,
      scheduleBalanceGbp: 110,
      totalDiscountGbp: 0,
      contractTotalGbp: 3650,
      nextDue: { rowId: "r1", amountGbp: 10, periodStart: "2026-08-11", periodEnd: "2026-08-11" },
    },
    health: {
      level: "attention",
      headline: "Needs attention",
      detail: "Test",
      onTimePercent: 35,
      onTimeCount: 0,
      eligiblePeriodCount: 2,
      overdueCount: 1,
      overdueTotalGbp: 10,
      pendingApprovalCount: 0,
      rejectedCount: 0,
    },
    attentionItems: [],
    lifecycleAttentionItems: [],
    chartPoints: [],
    lifecycle: {} as HireDashboardData["lifecycle"],
    recentEvents: [],
    includeDeposit: true,
    canTerminate: true,
    settlementBalance: null,
    hasPostEndPrepaidPayments: false,
    contractEndedYmd: null,
    contractEndedAtLabel: null,
    driverDocumentsRetainUntilLabel: null,
    driverDocumentsRetentionWarning: null,
    depositPendingReview: false,
    depositGbp: 100,
    depositDispositionLabel: null,
    financialClosure: {} as HireDashboardData["financialClosure"],
    overview: {} as HireDashboardData["overview"],
    terminationSummary: null,
    ...overrides,
  };
}

describe("buildActiveHirePaymentPosition", () => {
  it("sums deposit balance and rent balance for currently due", () => {
    const position = buildActiveHirePaymentPosition({
      dashboard: dashboard(),
      paymentRows: [{ rowKind: "deposit", balanceGbp: 100, netDueGbp: 100 }],
    });
    expect(position.currentlyDueGbp).toBe(110);
    expect(position.depositOutstandingGbp).toBe(100);
    expect(position.rentOutstandingGbp).toBe(10);
    expect(position.dueBreakdownLabel).toContain("deposit plus");
  });

  it("ignores deposit when includeDeposit is false", () => {
    const position = buildActiveHirePaymentPosition({
      dashboard: dashboard({ includeDeposit: false }),
      paymentRows: [{ rowKind: "deposit", balanceGbp: 100, netDueGbp: 100 }],
    });
    expect(position.depositOutstandingGbp).toBe(0);
    expect(position.currentlyDueGbp).toBe(10);
  });
});

describe("depositRowFromPayments", () => {
  it("returns the deposit row when present", () => {
    expect(
      depositRowFromPayments([
        { rowKind: "rent", balanceGbp: 10, netDueGbp: 10 },
        { rowKind: "deposit", balanceGbp: 100, netDueGbp: 100 },
      ])?.balanceGbp,
    ).toBe(100);
  });
});

describe("formatAmountDueChip", () => {
  it("formats chip when amount is due", () => {
    expect(formatAmountDueChip(110)).toBe("£110.00 due today");
  });

  it("returns null when nothing is due", () => {
    expect(formatAmountDueChip(0)).toBeNull();
  });
});

describe("buildActiveHirePaymentRatingDisplay", () => {
  it("flags attention when deposit and rent are unpaid even if health is on_track", () => {
    const position = buildActiveHirePaymentPosition({
      dashboard: dashboard(),
      paymentRows: [{ rowKind: "deposit", balanceGbp: 100, netDueGbp: 100 }],
    });
    const rating = buildActiveHirePaymentRatingDisplay({
      health: dashboard().health,
      position,
      attentionItems: [{ kind: "due", title: "Day 1 rent", amountGbp: 10 }],
      includeDeposit: true,
    });
    expect(rating.level).toBe("attention");
    expect(rating.label).toBe("Needs attention");
    expect(rating.detail).toContain("£100.00 deposit");
    expect(rating.detail).toContain("today's £10.00 rent");
    expect(rating.detail).not.toContain("up to date");
    expect(rating.scoreHint).toContain("0 of 2 due items paid");
  });

  it("uses on_track copy only when nothing is outstanding", () => {
    const rating = buildActiveHirePaymentRatingDisplay({
      health: {
        level: "on_track",
        headline: "Payments on track",
        detail: "No overdue periods",
        onTimePercent: 100,
        onTimeCount: 2,
        eligiblePeriodCount: 2,
        overdueCount: 0,
        overdueTotalGbp: 0,
        pendingApprovalCount: 0,
        rejectedCount: 0,
      },
      position: {
        depositOutstandingGbp: 0,
        rentDueToDateGbp: 20,
        rentOutstandingGbp: 0,
        rentPaidGbp: 20,
        currentlyDueGbp: 0,
        dueBreakdownLabel: null,
      },
      attentionItems: [],
      includeDeposit: true,
    });
    expect(rating.level).toBe("on_track");
    expect(rating.detail).toBe("Recorded payments are up to date for this hire.");
  });

  it("elevates level when money is outstanding", () => {
    expect(
      resolveActiveHirePaymentRatingLevel(
        { level: "on_track" } as HireDashboardData["health"],
        {
          depositOutstandingGbp: 0,
          rentDueToDateGbp: 10,
          rentOutstandingGbp: 10,
          rentPaidGbp: 0,
          currentlyDueGbp: 10,
          dueBreakdownLabel: null,
        },
      ),
    ).toBe("attention");
  });
});
