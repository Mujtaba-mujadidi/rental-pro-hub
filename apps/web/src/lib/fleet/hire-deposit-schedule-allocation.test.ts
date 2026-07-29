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
  it("clears accrued rent balance after deposit was applied at termination", () => {
    const enriched = enrichHirePaymentRows([rentRow], "2026-07-28");
    const summary = summarizeHirePayments([rentRow], "2026-07-28");
    expect(summary.balanceGbp).toBe(130);

    const reconciled = reconcileEndedHirePaymentsWithDepositCredit({
      rows: enriched,
      summary,
      disposition: "apply_to_balance",
      terminationSummary: { depositGbp: 200, signedRentBalanceGbp: 130 },
      accrualYmd: "2026-07-28",
    });

    expect(reconciled.summary.balanceGbp).toBe(0);
    expect(reconciled.summary.totalPaidGbp).toBe(130);
    expect(reconciled.rows[0]?.paidGbp).toBe(130);
    expect(reconciled.rows[0]?.balanceGbp).toBe(0);
  });
});

describe("applyDepositCreditToEnrichedRows", () => {
  it("allocates credit FIFO across accrued rent rows", () => {
    const rows = enrichHirePaymentRows([rentRow], "2026-07-28");
    const adjusted = applyDepositCreditToEnrichedRows(rows, 130, "2026-07-28");
    expect(adjusted[0]?.balanceGbp).toBe(0);
  });
});
