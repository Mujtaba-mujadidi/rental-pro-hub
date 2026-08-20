import { describe, expect, it } from "vitest";
import {
  requiresDepositDispositionReason,
  summarizeHireRentSettlement,
} from "@/lib/fleet/hire-rent-settlement";
import type { HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";

const rentRows: HirePaymentScheduleRowInput[] = [
  {
    id: "w1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-07",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "approved",
    approvedAmountGbp: 250,
    pendingSubmittedGbp: null,
    sortOrder: 1,
  },
  {
    id: "w2",
    periodStart: "2026-07-08",
    periodEnd: "2026-07-14",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: 2,
  },
  {
    id: "w3",
    periodStart: "2026-07-15",
    periodEnd: "2026-07-21",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "approved",
    approvedAmountGbp: 250,
    pendingSubmittedGbp: null,
    sortOrder: 3,
  },
];

describe("summarizeHireRentSettlement", () => {
  it("detects accrued overpayment", () => {
    const overpaid: HirePaymentScheduleRowInput[] = [
      {
        ...rentRows[0]!,
        approvedAmountGbp: 350,
      },
      rentRows[1]!,
    ];
    const summary = summarizeHireRentSettlement(overpaid, "2026-07-10");
    expect(summary.accruedRentDueGbp).toBe(500);
    expect(summary.accruedRentPaidGbp).toBe(350);
    expect(summary.accruedOverpaymentGbp).toBe(0);
    expect(summary.signedRentSettlementGbp).toBe(150);
  });

  it("includes prepaid future rent as driver credit", () => {
    const summary = summarizeHireRentSettlement(rentRows, "2026-07-10");
    expect(summary.accruedRentDueGbp).toBe(500);
    expect(summary.accruedRentPaidGbp).toBe(250);
    expect(summary.prepaidRentCreditGbp).toBe(250);
    expect(summary.signedRentSettlementGbp).toBe(0);
    expect(summary.billingMode).toBe("end_of_period");
  });

  it("pro-rates the current period when billing mode is actual", () => {
    const summary = summarizeHireRentSettlement(rentRows.slice(0, 1), "2026-07-05", {
      billingMode: "actual",
      rentCadence: "weekly",
    });
    expect(summary.accruedRentDueGbp).toBeCloseTo(178.57, 2);
    expect(summary.billingPeriodBreakdown).toMatchObject({
      daysUsed: 5,
      daysInPeriod: 7,
      actualDueGbp: 178.57,
      endOfPeriodDueGbp: 250,
    });
  });
});

describe("requiresDepositDispositionReason", () => {
  it("requires reason only for final non-full-refund decisions", () => {
    expect(requiresDepositDispositionReason("forfeit")).toBe(true);
    expect(requiresDepositDispositionReason("apply_to_balance")).toBe(true);
    expect(requiresDepositDispositionReason("refund_partial")).toBe(true);
    expect(requiresDepositDispositionReason("refund_full")).toBe(false);
    expect(requiresDepositDispositionReason("hold_pending")).toBe(false);
  });
});
