import { describe, expect, it } from "vitest";
import {
  computeDepositResolutionSettlement,
  isDepositDispositionPending,
} from "@/lib/fleet/hire-deposit-resolution";

describe("isDepositDispositionPending", () => {
  it("detects hold_pending", () => {
    expect(isDepositDispositionPending("hold_pending")).toBe(true);
    expect(isDepositDispositionPending("refund_full")).toBe(false);
  });
});

describe("computeDepositResolutionSettlement", () => {
  it("refunds full deposit when rent settlement is already cleared", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 0,
        depositGbp: 500,
        disposition: "refund_full",
      }),
    ).toBe(-500);
  });

  it("forfeits deposit without creating a credit when rent is settled", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 0,
        depositGbp: 500,
        disposition: "forfeit",
      }),
    ).toBe(0);
  });

  it("applies deposit against outstanding rent first", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 300,
        depositGbp: 500,
        disposition: "apply_to_balance",
      }),
    ).toBe(-200);
  });

  it("caps forfeit at zero when deposit exceeds rent owed", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 300,
        depositGbp: 500,
        disposition: "forfeit",
      }),
    ).toBe(0);
  });
});
