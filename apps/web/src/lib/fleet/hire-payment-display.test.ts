import { describe, expect, it } from "vitest";
import {
  deriveHirePaymentDisplayStatus,
  hirePaymentDisplayStatusMeta,
} from "@/lib/fleet/hire-payment-display";

const base = {
  paymentStatus: "not_received" as const,
  balanceGbp: 100,
  paidGbp: 0,
  netDueGbp: 100,
  accrued: true,
  periodStart: "2026-07-07",
  periodEnd: "2026-07-14",
};

const postEndPrepaid = {
  ...base,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-07",
  accrued: false,
  paidGbp: 100,
  paymentStatus: "approved" as const,
};

const endedOptions = { contractEndedYmd: "2026-07-20" };

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

  it("returns pending approval from workflow status", () => {
    expect(
      deriveHirePaymentDisplayStatus({ ...base, paymentStatus: "pending_approval" }, "2026-07-10"),
    ).toBe("pending_approval");
  });

  it("returns rejected only after the period has started", () => {
    expect(
      deriveHirePaymentDisplayStatus({ ...base, paymentStatus: "rejected" }, "2026-07-10"),
    ).toBe("rejected");
    expect(
      deriveHirePaymentDisplayStatus(
        {
          ...base,
          paymentStatus: "rejected",
          accrued: false,
          periodStart: "2026-07-28",
          periodEnd: "2026-08-02",
        },
        "2026-07-27",
      ),
    ).toBe("upcoming");
  });

  it("marks post-termination future periods as waived or refunded", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...base, periodStart: "2026-08-01", periodEnd: "2026-08-07", accrued: false },
        "2026-07-27",
        endedOptions,
      ),
    ).toBe("waived");
    expect(deriveHirePaymentDisplayStatus(postEndPrepaid, "2026-07-27", endedOptions)).toBe(
      "refunded",
    );
  });

  it("shows pending approval for post-end prepaid awaiting staff review", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        {
          ...postEndPrepaid,
          paymentStatus: "pending_approval",
          paidGbp: 0,
          pendingSubmittedGbp: 100,
        },
        "2026-07-27",
        endedOptions,
      ),
    ).toBe("pending_approval");
  });

  it("marks post-end prepaid as settled once final settlement is cleared", () => {
    expect(
      deriveHirePaymentDisplayStatus(postEndPrepaid, "2026-07-27", {
        ...endedOptions,
        settlementSettled: true,
      }),
    ).toBe("prepaid_settled");
  });

  it("marks post-end prepaid as Refunded when the company has issued the refund", () => {
    expect(
      deriveHirePaymentDisplayStatus(
        { ...postEndPrepaid, id: "r1" },
        "2026-07-27",
        {
          ...endedOptions,
          settlementSettled: true,
          refundMarkByRowId: new Map([["r1", "refunded"]]),
        },
      ),
    ).toBe("prepaid_refunded");
    expect(hirePaymentDisplayStatusMeta("prepaid_refunded").label).toBe("Refunded");
  });
});

describe("hirePaymentDisplayStatusMeta", () => {
  it("uses audience-specific labels for prepaid refund due", () => {
    expect(hirePaymentDisplayStatusMeta("refunded", { audience: "driver" }).label).toBe(
      "Refund expected",
    );
    expect(hirePaymentDisplayStatusMeta("refunded", { audience: "staff" }).label).toBe(
      "Prepaid — refund due",
    );
  });

  it("labels settled prepaid rows consistently", () => {
    expect(hirePaymentDisplayStatusMeta("prepaid_settled").label).toBe("Settled");
  });
});
