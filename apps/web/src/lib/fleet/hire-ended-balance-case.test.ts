import { describe, expect, it } from "vitest";
import {
  buildHireEndedBalanceLifecycle,
  countHireEndedPendingReviews,
  hireEndedConfirmedPositionLabel,
  resolveHireEndedBalanceCase,
  type HireEndedPendingReviewsSummary,
} from "./hire-ended-balance-case";

const emptyPending: HireEndedPendingReviewsSummary = {
  depositPending: false,
  depositHeldGbp: 0,
  charges: [],
};

describe("resolveHireEndedBalanceCase", () => {
  it("treats deposit or charge pending as case 1", () => {
    expect(
      resolveHireEndedBalanceCase({
        settled: false,
        openBalanceGbp: 760,
        pendingReviews: {
          depositPending: true,
          depositHeldGbp: 600,
          charges: [],
        },
      }),
    ).toBe("pending_review");

    expect(
      resolveHireEndedBalanceCase({
        settled: false,
        openBalanceGbp: 760,
        pendingReviews: {
          depositPending: false,
          depositHeldGbp: 0,
          charges: [
            {
              id: "d1",
              kind: "damage",
              label: "Front bonnet chip",
              detail: null,
              proposedGbp: 250,
              evidenceHref: null,
            },
          ],
        },
      }),
    ).toBe("pending_review");
  });

  it("uses open_balance when nothing is pending", () => {
    expect(
      resolveHireEndedBalanceCase({
        settled: false,
        openBalanceGbp: 760,
        pendingReviews: emptyPending,
      }),
    ).toBe("open_balance");
  });

  it("uses settled when balance is clear and nothing pending", () => {
    expect(
      resolveHireEndedBalanceCase({
        settled: true,
        openBalanceGbp: 0,
        pendingReviews: emptyPending,
      }),
    ).toBe("settled");
  });
});

describe("buildHireEndedBalanceLifecycle", () => {
  it("marks final account as review required for case 1", () => {
    const steps = buildHireEndedBalanceLifecycle({
      balanceCase: "pending_review",
      openBalanceGbp: 760,
      pendingReviewCount: 1,
    });
    expect(steps[2]?.status).toBe("active");
    expect(steps[2]?.detail).toBe("Review required");
    expect(steps[3]?.status).toBe("upcoming");
  });

  it("uses balance outstanding copy for case 2", () => {
    const steps = buildHireEndedBalanceLifecycle({
      balanceCase: "open_balance",
      openBalanceGbp: 410,
      pendingReviewCount: 0,
    });
    expect(steps[2]?.detail).toBe("Balance outstanding");
  });
});

describe("helpers", () => {
  it("counts deposit plus charges", () => {
    expect(
      countHireEndedPendingReviews({
        depositPending: true,
        depositHeldGbp: 100,
        charges: [
          {
            id: "a",
            kind: "fuel",
            label: "Fuel",
            detail: null,
            proposedGbp: 50,
            evidenceHref: null,
          },
        ],
      }),
    ).toBe(2);
  });

  it("formats confirmed position labels", () => {
    expect(
      hireEndedConfirmedPositionLabel({
        direction: "driver_owes_company",
        amountGbp: 760,
      }),
    ).toBe("Driver owes £760.00");
  });

  it("treats near-zero open balance as settled when nothing pending", () => {
    expect(
      resolveHireEndedBalanceCase({
        settled: false,
        openBalanceGbp: 0.004,
        pendingReviews: emptyPending,
      }),
    ).toBe("settled");
  });
});
