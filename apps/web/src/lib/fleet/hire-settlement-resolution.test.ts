import { describe, expect, it } from "vitest";
import {
  defaultDepositDisposition,
  getDepositDispositionOptions,
  resolveTerminationBalanceState,
  settlementStepRequired,
} from "@/lib/fleet/hire-settlement-resolution";

describe("hire-settlement-resolution", () => {
  it("disables apply_to_balance when company owes on settlement", () => {
    const options = getDepositDispositionOptions(-100);
    expect(options.find((o) => o.value === "apply_to_balance")?.allowed).toBe(false);
    expect(defaultDepositDisposition(-100)).toBe("refund_full");
  });

  it("allows apply_to_balance when driver owes on settlement (including extras)", () => {
    const options = getDepositDispositionOptions(200);
    expect(options.find((o) => o.value === "apply_to_balance")?.allowed).toBe(true);
    expect(defaultDepositDisposition(200)).toBe("apply_to_balance");
    // Damage-only open balance (rent already cleared) must still allow apply.
    expect(defaultDepositDisposition(400)).toBe("apply_to_balance");
    expect(getDepositDispositionOptions(400).find((o) => o.value === "apply_to_balance")?.allowed).toBe(
      true,
    );
  });

  it("requires settlement step when net balance is non-zero", () => {
    expect(settlementStepRequired(50)).toBe(true);
    expect(settlementStepRequired(0)).toBe(false);
  });

  it("records payment when clearing now", () => {
    const state = resolveTerminationBalanceState({
      netSettlementGbp: 120,
      resolution: "paid_now",
    });
    expect(state.settlementBalanceDirection).toBe("settled");
    expect(state.recordPayment).toEqual({
      amountGbp: 120,
      direction: "received_from_driver",
    });
  });

  it("writes off driver debt as discount", () => {
    const state = resolveTerminationBalanceState({
      netSettlementGbp: 80,
      resolution: "written_off",
    });
    expect(state.settlementDiscountGbp).toBe(80);
    expect(state.settlementBalanceDirection).toBe("settled");
  });

  it("keeps open balance for phased payment", () => {
    const state = resolveTerminationBalanceState({
      netSettlementGbp: -200,
      resolution: "open_balance",
    });
    expect(state.settlementBalanceGbp).toBe(200);
    expect(state.settlementBalanceDirection).toBe("company_owes_driver");
    expect(state.recordPayment).toBeNull();
  });
});
