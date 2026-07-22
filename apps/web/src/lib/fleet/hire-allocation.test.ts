import { describe, expect, it } from "vitest";
import { allocateLumpSumToRows } from "@/lib/fleet/hire-allocation";

describe("allocateLumpSumToRows", () => {
  const rows = [
    { id: "a", netAmountGbp: 100, paymentStatus: "not_received" as const, sortOrder: 0 },
    { id: "b", netAmountGbp: 100, paymentStatus: "not_received" as const, sortOrder: 1 },
    { id: "c", netAmountGbp: 100, paymentStatus: "approved" as const, sortOrder: 2 },
  ];

  it("allocates to oldest unpaid first", () => {
    expect(allocateLumpSumToRows(150, rows)).toEqual([
      { rowId: "a", allocatedGbp: 100 },
      { rowId: "b", allocatedGbp: 50 },
    ]);
  });

  it("skips approved rows", () => {
    expect(allocateLumpSumToRows(50, rows)).toEqual([{ rowId: "a", allocatedGbp: 50 }]);
  });
});
