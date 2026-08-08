import { describe, expect, it } from "vitest";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";

describe("computeHireWorkspaceSettlementBalance", () => {
  it("returns settled when the hire is marked settled in the database", () => {
    const result = computeHireWorkspaceSettlementBalance({
      settlementBalanceDirection: "settled",
      settlementBalanceGbp: 0,
      balancePayments: [{ amountGbp: 330, direction: "received_from_driver" }],
    });

    expect(result).toEqual({
      settlementDirection: "settled",
      openBalanceGbp: 0,
      settled: true,
    });
  });

  it("uses the database open balance without replaying payment history", () => {
    const result = computeHireWorkspaceSettlementBalance({
      settlementBalanceDirection: "company_owes_driver",
      settlementBalanceGbp: 242.86,
      balancePayments: [{ amountGbp: 100, direction: "paid_to_driver" }],
    });

    expect(result).toEqual({
      settlementDirection: "company_owes_driver",
      openBalanceGbp: 242.86,
      settled: false,
    });
  });
});
