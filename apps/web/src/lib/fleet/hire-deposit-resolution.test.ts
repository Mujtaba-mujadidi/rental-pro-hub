import { describe, expect, it } from "vitest";
import {
  computeDepositResolutionSettlement,
  buildDepositResolutionPreview,
  allocateDepositApplyToBalanceGbp,
  hireDepositHeldGbp,
  isDepositDispositionPending,
} from "@/lib/fleet/hire-deposit-resolution";

describe("isDepositDispositionPending", () => {
  it("detects hold_pending", () => {
    expect(isDepositDispositionPending("hold_pending")).toBe(true);
    expect(isDepositDispositionPending("refund_full")).toBe(false);
  });
});

describe("hireDepositHeldGbp", () => {
  it("uses received cash only while disposition is hold_pending", () => {
    expect(
      hireDepositHeldGbp({
        depositDisposition: "hold_pending",
        depositReceivedGbp: 500,
      }),
    ).toBe(500);
    expect(
      hireDepositHeldGbp({
        depositDisposition: "hold_pending",
        depositReceivedGbp: 0,
      }),
    ).toBe(0);
    expect(
      hireDepositHeldGbp({
        depositDisposition: "refund_full",
        depositReceivedGbp: 500,
      }),
    ).toBe(0);
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

  it("does not reduce charge balance when returning full deposit while driver still owes", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 760,
        depositGbp: 500,
        disposition: "refund_full",
      }),
    ).toBe(760);
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 760,
        depositGbp: 500,
        disposition: "apply_to_balance",
      }),
    ).toBe(260);
  });

  it("builds preview with separate refund due when returning deposit on an open balance", () => {
    const preview = buildDepositResolutionPreview({
      currentSignedSettlementGbp: 760,
      depositHeldGbp: 500,
      disposition: "refund_full",
    });
    expect(preview.afterSignedSettlementGbp).toBe(760);
    expect(preview.depositRefundDueGbp).toBe(500);
    expect(preview.depositAppliedToBalanceGbp).toBe(0);
  });

  it("previews apply-to-balance waterfall: rent then charges", () => {
    const preview = buildDepositResolutionPreview({
      currentSignedSettlementGbp: 1050,
      depositHeldGbp: 600,
      disposition: "apply_to_balance",
      unpaidRentGbp: 600,
      unpaidChargesGbp: 450,
    });
    expect(preview.afterSignedSettlementGbp).toBe(450);
    expect(preview.depositAppliedToRentGbp).toBe(600);
    expect(preview.depositAppliedToChargesGbp).toBe(0);
    expect(preview.depositAppliedToBalanceGbp).toBe(600);
  });

  it("previews apply-to-balance covering rent and part of charges", () => {
    const preview = buildDepositResolutionPreview({
      currentSignedSettlementGbp: 750,
      depositHeldGbp: 900,
      disposition: "apply_to_balance",
      unpaidRentGbp: 300,
      unpaidChargesGbp: 450,
    });
    expect(preview.depositAppliedToRentGbp).toBe(300);
    expect(preview.depositAppliedToChargesGbp).toBe(450);
    expect(preview.afterSignedSettlementGbp).toBe(-150);
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

  it("offsets open settlement by held deposit for apply_to_balance only", () => {
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 760,
        depositGbp: 500,
        disposition: "apply_to_balance",
      }),
    ).toBe(260);
    expect(
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: 760,
        depositGbp: 500,
        disposition: "refund_full",
      }),
    ).toBe(760);
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

describe("allocateDepositApplyToBalanceGbp", () => {
  it("pours deposit onto rent before charges", () => {
    expect(
      allocateDepositApplyToBalanceGbp({
        depositGbp: 600,
        unpaidRentGbp: 400,
        unpaidChargesGbp: 450,
      }),
    ).toEqual({
      appliedToRentGbp: 400,
      appliedToChargesGbp: 200,
      surplusGbp: 0,
    });
  });

  it("leaves surplus when deposit exceeds rent and charges", () => {
    expect(
      allocateDepositApplyToBalanceGbp({
        depositGbp: 1000,
        unpaidRentGbp: 300,
        unpaidChargesGbp: 200,
      }),
    ).toEqual({
      appliedToRentGbp: 300,
      appliedToChargesGbp: 200,
      surplusGbp: 500,
    });
  });
});
