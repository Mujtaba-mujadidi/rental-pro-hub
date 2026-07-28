import { describe, expect, it } from "vitest";
import { openBalanceDirection, remainingOpenBalanceGbp, signedSettlementBalanceGbp } from "@/lib/fleet/hire-open-balance";

describe("hire-open-balance", () => {
  it("signs settlement balances by direction", () => {
    expect(signedSettlementBalanceGbp("driver_owes_company", 120)).toBe(120);
    expect(signedSettlementBalanceGbp("company_owes_driver", 80)).toBe(-80);
    expect(signedSettlementBalanceGbp("settled", 80)).toBe(0);
  });

  it("reduces open balance as payments are recorded", () => {
    const remaining = remainingOpenBalanceGbp(200, [
      { amountGbp: 50, direction: "received_from_driver" },
      { amountGbp: 25, direction: "received_from_driver" },
    ]);
    expect(remaining).toBe(125);
    expect(openBalanceDirection(remaining)).toBe("driver_owes_company");
  });

  it("tracks payouts to the driver", () => {
    const remaining = remainingOpenBalanceGbp(-100, [{ amountGbp: 40, direction: "paid_to_driver" }]);
    expect(remaining).toBe(-60);
    expect(openBalanceDirection(remaining)).toBe("company_owes_driver");
  });
});
