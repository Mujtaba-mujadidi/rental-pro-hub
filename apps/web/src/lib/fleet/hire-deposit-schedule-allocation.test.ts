import { describe, expect, it } from "vitest";
import {
  applyDepositCreditToEnrichedRows,
  depositRentScheduleCreditGbp,
  reconcileEndedHirePaymentsWithDepositCredit,
} from "@/lib/fleet/hire-deposit-schedule-allocation";
import { enrichHirePaymentRows, summarizeHirePayments } from "@/lib/fleet/hire-payment-summary";

const rentRow = {
  id: "rent-1",
  periodStart: "2026-07-28",
  periodEnd: "2026-08-03",
  rowKind: "rent" as const,
  baseAmountGbp: 130,
  discountTotalGbp: 0,
  paymentStatus: "not_received" as const,
  approvedAmountGbp: null,
  pendingSubmittedGbp: null,
  sortOrder: 1,
};

describe("depositRentScheduleCreditGbp", () => {
  it("applies deposit to rent when disposition is apply_to_balance", () => {
    expect(
      depositRentScheduleCreditGbp({
        disposition: "apply_to_balance",
        depositGbp: 200,
        signedRentBalanceGbp: 130,
      }),
    ).toBe(130);
  });

  it("returns zero when rent is already settled on the sheet", () => {
    expect(
      depositRentScheduleCreditGbp({
        disposition: "apply_to_balance",
        depositGbp: 200,
        signedRentBalanceGbp: 0,
      }),
    ).toBe(0);
  });

  it("does not apply rent credit when returning the full deposit", () => {
    expect(
      depositRentScheduleCreditGbp({
        disposition: "refund_full",
        depositGbp: 200,
        signedRentBalanceGbp: 130,
      }),
    ).toBe(0);
  });

  it("uses retained deposit on partial refund", () => {
    expect(
      depositRentScheduleCreditGbp({
        disposition: "refund_partial",
        depositGbp: 200,
        signedRentBalanceGbp: 130,
        depositRefundAmountGbp: 70,
      }),
    ).toBe(130);
  });
});

describe("reconcileEndedHirePaymentsWithDepositCredit", () => {
  it("skips duplicate deposit credit already persisted on the schedule", () => {
    const rowWithDepositCredit = {
      ...rentRow,
      paymentStatus: "approved" as const,
      approvedAmountGbp: 130,
    };
    const enriched = enrichHirePaymentRows([rowWithDepositCredit], "2026-07-28");
    const summary = summarizeHirePayments([rowWithDepositCredit], "2026-07-28");
    expect(summary.balanceGbp).toBe(0);

    const reconciled = reconcileEndedHirePaymentsWithDepositCredit({
      rows: enriched,
      summary,
      disposition: "apply_to_balance",
      terminationSummary: {
        depositGbp: 200,
        signedRentBalanceGbp: 130,
        accruedRentPaidGbp: 0,
      },
      accrualYmd: "2026-07-28",
    });

    expect(reconciled.summary.balanceGbp).toBe(0);
    expect(reconciled.rows[0]?.paidGbp).toBe(130);
  });
});

describe("applyDepositCreditToEnrichedRows", () => {
  it("allocates credit FIFO across accrued rent rows", () => {
    const rows = enrichHirePaymentRows([rentRow], "2026-07-28");
    const adjusted = applyDepositCreditToEnrichedRows(rows, 130, "2026-07-28");
    expect(adjusted[0]?.balanceGbp).toBe(0);
  });
});
