import { describe, expect, it } from "vitest";
import { deriveHirePaymentDisplayStatus } from "@/lib/fleet/hire-payment-display";

const base = {
  paymentStatus: "not_received" as const,
  balanceGbp: 100,
  paidGbp: 0,
  netDueGbp: 100,
  accrued: true,
  periodEnd: "2026-07-14",
};

describe("deriveHirePaymentDisplayStatus", () => {
  it("returns overdue when accrued period has ended with balance", () => {
    expect(deriveHirePaymentDisplayStatus(base, "2026-07-20")).toBe("overdue");
  });

  it("returns due during an accrued open period", () => {
    expect(deriveHirePaymentDisplayStatus(base, "2026-07-10")).toBe("due");
  });

  it("returns upcoming before period starts", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, accrued: false, periodEnd: "2026-08-14" },
        "2026-07-10",
      ),
    ).toBe("upcoming");
  });

  it("returns paid when balance is zero", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, paymentStatus: "approved", balanceGbp: 0, paidGbp: 100 },
        "2026-07-20",
      ),
    ).toBe("paid");
  });

  it("returns partially paid when some amount is approved", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, paymentStatus: "approved", balanceGbp: 40, paidGbp: 60 },
        "2026-07-10",
      ),
    ).toBe("partially_paid");
  });

  it("returns cleared when discounted to zero", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, balanceGbp: 0, paidGbp: 0, netDueGbp: 0 },
        "2026-07-10",
      ),
    ).toBe("cleared");
  });

  it("returns pending approval and rejected from workflow status", () => {
    expect(
      deriveHirePaymentDisplayStatus({ ...base, paymentStatus: "pending_approval" }, "2026-07-10"),
    ).toBe("pending_approval");
    expect(
      deriveHirePaymentDisplayStatus({ ...base, paymentStatus: "rejected" }, "2026-07-10"),
    ).toBe("rejected");
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, paymentStatus: "rejected", pendingSubmittedGbp: 100 },
        "2026-07-10",
      ),
    ).toBe("rejected");
  });
});
