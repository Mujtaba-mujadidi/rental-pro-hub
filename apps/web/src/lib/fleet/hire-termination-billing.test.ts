import { describe, expect, it } from "vitest";
import { enrichHirePaymentRows, type HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";
import {
  buildTerminationBillingPeriodBreakdown,
  supportsEndOfPeriodBilling,
  terminationRentDueForRow,
} from "@/lib/fleet/hire-termination-billing";

const weeklyRows: HirePaymentScheduleRowInput[] = [
  {
    id: "w1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-07",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
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
];

describe("hire-termination-billing", () => {
  it("supports end-of-period billing for weekly and monthly only", () => {
    expect(supportsEndOfPeriodBilling("weekly")).toBe(true);
    expect(supportsEndOfPeriodBilling("monthly")).toBe(true);
    expect(supportsEndOfPeriodBilling("daily")).toBe(false);
  });

  it("pro-rates the current weekly period for actual billing", () => {
    const enriched = enrichHirePaymentRows(weeklyRows, "2026-07-05");
    const row = enriched[0]!;
    expect(terminationRentDueForRow(row, "2026-07-05", "actual", "weekly")).toBeCloseTo(178.57, 2);
    expect(terminationRentDueForRow(row, "2026-07-05", "end_of_period", "weekly")).toBe(250);
  });

  it("charges full amount for completed periods regardless of mode", () => {
    const enriched = enrichHirePaymentRows(weeklyRows, "2026-07-10");
    const row = enriched[0]!;
    expect(terminationRentDueForRow(row, "2026-07-10", "actual", "weekly")).toBe(250);
    expect(terminationRentDueForRow(row, "2026-07-10", "end_of_period", "weekly")).toBe(250);
  });

  it("builds a breakdown when terminating mid-period", () => {
    const enriched = enrichHirePaymentRows(weeklyRows, "2026-07-05");
    const breakdown = buildTerminationBillingPeriodBreakdown(enriched, "2026-07-05", "weekly");
    expect(breakdown).toMatchObject({
      daysUsed: 5,
      daysInPeriod: 7,
      actualDueGbp: 178.57,
      endOfPeriodDueGbp: 250,
    });
  });
});
