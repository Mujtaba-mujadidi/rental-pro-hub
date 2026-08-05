import { describe, expect, it } from "vitest";
import {
  hireDepositStatusLabel,
  summarizeHireFinancialClosure,
} from "@/lib/fleet/hire-financial-closure";

describe("summarizeHireFinancialClosure", () => {
  it("requires both rent settlement and deposit resolution to close", () => {
    expect(
      summarizeHireFinancialClosure({
        settlementBalance: { settled: true },
        depositDisposition: "hold_pending",
        depositGbp: 300,
      }),
    ).toEqual({
      rentSettlementSettled: true,
      depositPendingReview: true,
      depositGbp: 300,
      financiallyClosed: false,
    });

    expect(
      summarizeHireFinancialClosure({
        settlementBalance: { settled: true },
        depositDisposition: "refund_full",
        depositGbp: 300,
      }).financiallyClosed,
    ).toBe(true);
  });
});

describe("hireDepositStatusLabel", () => {
  it("shows pending review when deposit is held", () => {
    expect(
      hireDepositStatusLabel({
        depositPendingReview: true,
        depositGbp: 300,
        depositDispositionLabel: null,
        scheduleDepositPaidLabel: "Paid",
      }),
    ).toBe("Pending review — £300.00 held");
  });
});
