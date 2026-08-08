import { describe, expect, it } from "vitest";
import {
  billedPeriodsForDuration,
  buildHireTerminationAccountsSummary,
  formatHireDurationWeeksAndDays,
  hireDepositDispositionLabel,
  hireProRataRentAdjustmentGbp,
  netSettlementAfterDeposit,
  resolveSettlementBalanceDirection,
  settlementBalanceLabel,
} from "@/lib/fleet/hire-termination-summary";

describe("hire-termination-summary", () => {
  it("computes billed periods by cadence", () => {
    expect(billedPeriodsForDuration("daily", 10)).toBe(10);
    expect(billedPeriodsForDuration("weekly", 10)).toBe(2);
    expect(billedPeriodsForDuration("monthly", 45)).toBe(2);
  });

  it("formats hire duration as weeks and days", () => {
    expect(formatHireDurationWeeksAndDays(7)).toBe("1 week");
    expect(formatHireDurationWeeksAndDays(11)).toBe("1 week and 4 days");
    expect(formatHireDurationWeeksAndDays(4)).toBe("4 days");
  });

  it("separates pro-rata adjustment from discounts", () => {
    expect(
      hireProRataRentAdjustmentGbp({
        rentGrossAccruedGbp: 200,
        totalDiscountGbp: 0,
        accruedRentDueGbp: 157.14,
      }),
    ).toBe(42.86);
    expect(
      hireProRataRentAdjustmentGbp({
        rentGrossAccruedGbp: 200,
        totalDiscountGbp: 20,
        accruedRentDueGbp: 137.14,
      }),
    ).toBe(42.86);
  });

  it("resolves balance direction", () => {
    expect(resolveSettlementBalanceDirection(10)).toBe("driver_owes_company");
    expect(resolveSettlementBalanceDirection(-5)).toBe("company_owes_driver");
    expect(resolveSettlementBalanceDirection(0)).toBe("settled");
  });

  it("applies deposit disposition to signed net settlement", () => {
    expect(
      netSettlementAfterDeposit({
        balanceGbp: 200,
        depositGbp: 150,
        disposition: "apply_to_balance",
      }),
    ).toBe(50);
    expect(
      netSettlementAfterDeposit({
        balanceGbp: 0,
        depositGbp: 150,
        disposition: "refund_full",
      }),
    ).toBe(-150);
    expect(
      netSettlementAfterDeposit({
        balanceGbp: -200,
        depositGbp: 500,
        disposition: "refund_full",
      }),
    ).toBe(-700);
    expect(
      netSettlementAfterDeposit({
        balanceGbp: 300,
        depositGbp: 500,
        disposition: "forfeit",
      }),
    ).toBe(0);
  });

  it("labels settlement balance for staff and driver audiences", () => {
    expect(settlementBalanceLabel("company_owes_driver", 242.86, "staff")).toBe(
      "You owe driver £242.86",
    );
    expect(settlementBalanceLabel("company_owes_driver", 242.86, "driver")).toBe(
      "Owed to you: £242.86",
    );
    expect(settlementBalanceLabel("driver_owes_company", 100, "staff")).toBe("Driver owes £100.00");
    expect(settlementBalanceLabel("driver_owes_company", 100, "driver")).toBe("You owe £100.00");
    expect(settlementBalanceLabel("settled", 0, "driver")).toBe("All clear — nothing owed");
  });

  it("labels deposit disposition for staff and driver audiences", () => {
    expect(hireDepositDispositionLabel("hold_pending", "staff")).toContain("decide later");
    expect(hireDepositDispositionLabel("hold_pending", "driver")).toContain("rental company");
    expect(hireDepositDispositionLabel("refund_full", "driver")).toBe("Full deposit returned to you");
  });

  it("builds accounts summary including rent credit", () => {
    const summary = buildHireTerminationAccountsSummary({
      activatedAt: "2026-01-01T10:00:00.000Z",
      terminatedAtIso: "2026-01-15T16:30:00.000Z",
      startDateYmd: "2026-01-01",
      rentCadence: "weekly",
      rentAmountGbp: 250,
      depositGbp: 500,
      paymentSummary: {
        rentGrossAccruedGbp: 500,
        totalDueGbp: 500,
        totalPaidGbp: 800,
        balanceGbp: 0,
        creditGbp: 0,
        signedAccruedBalanceGbp: -300,
        scheduleBalanceGbp: 0,
        totalDiscountGbp: 0,
        contractTotalGbp: 1000,
        nextDue: null,
      },
      rentSettlement: {
        accruedRentDueGbp: 500,
        accruedRentPaidGbp: 800,
        prepaidRentCreditGbp: 0,
        accruedOverpaymentGbp: 300,
        signedRentSettlementGbp: -300,
        billingMode: "end_of_period",
        billingPeriodBreakdown: null,
      },
      depositDisposition: "apply_to_balance",
    });

    expect(summary.durationDays).toBe(15);
    expect(summary.rentCreditGbp).toBe(300);
    expect(summary.netSettlementGbp).toBe(-800);
    expect(summary.balanceDirection).toBe("company_owes_driver");
  });
});
