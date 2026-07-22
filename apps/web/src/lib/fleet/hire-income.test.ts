import { describe, expect, it } from "vitest";
import { sumApprovedHireIncomeGbp } from "@/lib/fleet/hire-income";

describe("sumApprovedHireIncomeGbp", () => {
  it("sums approved rows net of discounts", () => {
    const total = sumApprovedHireIncomeGbp([
      { paymentStatus: "approved", approvedAmountGbp: null, baseAmountGbp: 250, discountTotalGbp: 50 },
      { paymentStatus: "approved", approvedAmountGbp: 200, baseAmountGbp: 250, discountTotalGbp: 0 },
      { paymentStatus: "not_received", approvedAmountGbp: null, baseAmountGbp: 250, discountTotalGbp: 0 },
    ]);
    expect(total).toBe(400);
  });
});
