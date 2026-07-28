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

  it("reduces open balance as settlement payments are recorded", () => {
    const result = computeHireWorkspaceSettlementBalance({
      settlementBalanceDirection: "driver_owes_company",
      settlementBalanceGbp: 330,
      balancePayments: [{ amountGbp: 330, direction: "received_from_driver" }],
    });

    expect(result).toEqual({
      settlementDirection: "settled",
      openBalanceGbp: 0,
      settled: true,
    });
  });
});
