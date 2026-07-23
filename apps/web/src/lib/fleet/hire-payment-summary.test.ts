import { describe, expect, it } from "vitest";
import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import {
  enrichHirePaymentRows,
  summarizeHirePayments,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";

const rows: HirePaymentScheduleRowInput[] = [
  {
    id: "dep",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-01",
    rowKind: "deposit",
    baseAmountGbp: 500,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: 0,
  },
  {
    id: "w1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-07",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 50,
    paymentStatus: "approved",
    approvedAmountGbp: 200,
    pendingSubmittedGbp: null,
    sortOrder: 1,
  },
  {
    id: "w2",
    periodStart: "2026-07-08",
    periodEnd: "2026-07-14",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: 2,
  },
  {
    id: "w3",
    periodStart: "2026-07-15",
    periodEnd: "2026-07-21",
    rowKind: "rent",
    baseAmountGbp: 250,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: 3,
  },
];

describe("hire-payment-summary", () => {
  it("excludes future periods from total due", () => {
    const summary = summarizeHirePayments(rows, "2026-07-10");
    // deposit 500 + w1 net 200 (paid) + w2 net 250 = 950 due, 200 paid
    expect(summary.totalDueGbp).toBe(950);
    expect(summary.totalPaidGbp).toBe(200);
    expect(summary.balanceGbp).toBe(750);
    expect(summary.scheduleBalanceGbp).toBe(1000);
    expect(summary.totalDiscountGbp).toBe(50);
    expect(summary.nextDue?.rowId).toBe("dep");
  });

  it("marks rows accrued when period has started", () => {
    const enriched = enrichHirePaymentRows(rows, "2026-07-10");
    expect(enriched.find((r) => r.id === "w3")?.accrued).toBe(false);
    expect(enriched.find((r) => r.id === "w2")?.accrued).toBe(true);
  });
});

describe("hire-payment-allocation", () => {
  it("allocates FIFO across all outstanding rows including future periods", () => {
    const result = allocatePaymentAcrossRows(600, rows, "2026-07-10");
    expect(result.allocations.map((a) => a.rowId)).toEqual(["dep", "w2"]);
    expect(result.allocations[0]?.allocatedGbp).toBe(500);
    expect(result.allocations[1]?.allocatedGbp).toBe(100);
    expect(result.allocations[1]?.fullyAllocated).toBe(false);
    expect(result.unallocatedGbp).toBe(0);
  });

  it("can prepay future periods on the sheet", () => {
    const result = allocatePaymentAcrossRows(1000, rows, "2026-07-10");
    expect(result.allocations.map((a) => a.rowId)).toEqual(["dep", "w2", "w3"]);
    expect(result.allocations[2]?.fullyAllocated).toBe(true);
    expect(result.unallocatedGbp).toBe(0);
  });

  it("returns unallocated when payment exceeds full sheet balance", () => {
    const result = allocatePaymentAcrossRows(2000, rows, "2026-07-10");
    expect(result.unallocatedGbp).toBe(1000);
  });

  it("supports accrued-only allocation when requested", () => {
    const result = allocatePaymentAcrossRows(1000, rows, "2026-07-10", { accruedOnly: true });
    expect(result.allocations.map((a) => a.rowId)).toEqual(["dep", "w2"]);
    expect(result.unallocatedGbp).toBe(250);
  });

  it("includes rejected rows so drivers can resubmit payment", () => {
    const rejectedRow: HirePaymentScheduleRowInput = {
      id: "w-rejected",
      periodStart: "2026-07-23",
      periodEnd: "2026-07-29",
      rowKind: "rent",
      baseAmountGbp: 250,
      discountTotalGbp: 0,
      paymentStatus: "rejected",
      approvedAmountGbp: null,
      pendingSubmittedGbp: null,
      sortOrder: 4,
    };
    const result = allocatePaymentAcrossRows(250, [rejectedRow], "2026-07-24");
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.rowId).toBe("w-rejected");
    expect(result.allocations[0]?.fullyAllocated).toBe(true);
  });

  it("allocates only the remaining balance after a rejected top-up on a partially paid row", () => {
    const partiallyPaidRejected: HirePaymentScheduleRowInput = {
      id: "w-partial-rejected",
      periodStart: "2026-07-23",
      periodEnd: "2026-07-29",
      rowKind: "rent",
      baseAmountGbp: 250,
      discountTotalGbp: 0,
      paymentStatus: "rejected",
      approvedAmountGbp: 100,
      pendingSubmittedGbp: null,
      sortOrder: 4,
    };
    const result = allocatePaymentAcrossRows(250, [partiallyPaidRejected], "2026-07-24");
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.allocatedGbp).toBe(150);
    expect(result.allocations[0]?.fullyAllocated).toBe(true);
  });
});
