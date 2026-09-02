import { describe, expect, it } from "vitest";
import {
  hireEndedPendingReviewBannerLine,
  sumHireEndedPendingChargeProposedGbp,
} from "./hire-ended-balance-overview";
import type { HireEndedPendingReviewsSummary } from "./hire-ended-balance-case";
import {
  hirePendingReturnReviewResolveGate,
  parseHirePendingReturnReviewAmountGbp,
  parseHirePendingReturnReviewDecision,
  parseHirePendingReturnReviewId,
} from "./hire-pending-return-review-resolve";

const pendingWithCharges: HireEndedPendingReviewsSummary = {
  depositPending: true,
  depositHeldGbp: 600,
  charges: [
    {
      id: "d1",
      kind: "damage",
      label: "Bonnet",
      detail: null,
      proposedGbp: 250,
      evidenceHref: null,
    },
    {
      id: "fuel-review",
      kind: "fuel",
      label: "Fuel",
      detail: null,
      proposedGbp: 40,
      evidenceHref: null,
    },
  ],
};

describe("hire-ended-balance-overview", () => {
  it("sums proposed pending charge amounts", () => {
    expect(sumHireEndedPendingChargeProposedGbp(pendingWithCharges)).toBe(290);
  });

  it("builds pending review banner line with projected total", () => {
    expect(
      hireEndedPendingReviewBannerLine({
        pendingReviews: pendingWithCharges,
        openBalanceGbp: 760,
      }),
    ).toBe("£290.00 awaiting review · projected £1,050.00");
  });
});

describe("hirePendingReturnReviewResolveGate", () => {
  it("denies viewers without rentals.write", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: false,
        hireStatus: "terminated",
      }),
    ).toBe("You do not have permission.");
  });

  it("denies active hires", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "active",
      }),
    ).toMatch(/after the contract has ended/);
  });

  it("allows terminated and completed hires with write access", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "terminated",
      }),
    ).toBeNull();
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "completed",
      }),
    ).toBeNull();
  });
});

describe("parseHirePendingReturnReviewId", () => {
  it("parses fuel, accessory, and damage ids", () => {
    expect(parseHirePendingReturnReviewId("fuel-review")).toEqual({ kind: "fuel" });
    expect(parseHirePendingReturnReviewId("accessory-hasSpareTyre")).toEqual({
      kind: "accessory",
      key: "hasSpareTyre",
    });
    expect(parseHirePendingReturnReviewId("accessory-nope")).toBeNull();
    expect(parseHirePendingReturnReviewId("not-a-uuid")).toBeNull();
    expect(
      parseHirePendingReturnReviewId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    ).toEqual({
      kind: "damage",
      damageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });
});

describe("parseHirePendingReturnReviewDecision / amount", () => {
  it("accepts approve and waive only", () => {
    expect(parseHirePendingReturnReviewDecision("approve")).toBe("approve");
    expect(parseHirePendingReturnReviewDecision("waive")).toBe("waive");
    expect(parseHirePendingReturnReviewDecision("reject")).toBeNull();
  });

  it("requires a positive amount on approve", () => {
    expect(parseHirePendingReturnReviewAmountGbp("waive", null)).toEqual({
      ok: true,
      amountGbp: null,
    });
    expect(parseHirePendingReturnReviewAmountGbp("approve", 0).ok).toBe(false);
    expect(parseHirePendingReturnReviewAmountGbp("approve", 25.5)).toEqual({
      ok: true,
      amountGbp: 25.5,
    });
  });
});
