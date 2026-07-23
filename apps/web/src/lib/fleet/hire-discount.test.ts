import { describe, expect, it } from "vitest";
import { computeHireDiscountGbp } from "@/lib/fleet/hire-discount";

describe("computeHireDiscountGbp", () => {
  it("returns amount for amount mode capped at balance", () => {
    expect(computeHireDiscountGbp("amount", 50, 200, 150)).toBe(50);
    expect(computeHireDiscountGbp("amount", 200, 200, 150)).toBe(150);
  });

  it("computes percent of net due capped at balance", () => {
    expect(computeHireDiscountGbp("percent", 10, 200, 200)).toBe(20);
    expect(computeHireDiscountGbp("percent", 50, 200, 80)).toBe(80);
  });

  it("rejects invalid percent", () => {
    expect(computeHireDiscountGbp("percent", 0, 200, 200)).toBeNull();
    expect(computeHireDiscountGbp("percent", 101, 200, 200)).toBeNull();
  });
});
