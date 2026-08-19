import { describe, expect, it } from "vitest";
import {
  filterPaymentScheduleForEndedContract,
  hasPostEndPrepaidRows,
  buildHireScheduleRefundMarksByRowId,
} from "@/lib/fleet/hire-ended-payment-schedule";

const rows = [
  {
    periodStart: "2026-07-01",
    rowKind: "rent",
    paidGbp: 100,
    paymentStatus: "approved",
  },
  {
    periodStart: "2026-07-08",
    rowKind: "rent",
    paidGbp: 0,
    paymentStatus: "not_received",
  },
  {
    periodStart: "2026-07-15",
    rowKind: "rent",
    paidGbp: 100,
    paymentStatus: "approved",
  },
  {
    periodStart: "2026-07-22",
    rowKind: "rent",
    paidGbp: 0,
    paymentStatus: "not_received",
  },
  {
    periodStart: "2026-07-01",
    rowKind: "deposit",
    paidGbp: 200,
    paymentStatus: "approved",
  },
];

describe("filterPaymentScheduleForEndedContract", () => {
  it("returns all rows when contract has not ended", () => {
    expect(filterPaymentScheduleForEndedContract(rows, "")).toHaveLength(rows.length);
  });

  it("keeps periods through end date and prepaid future rows only", () => {
    const filtered = filterPaymentScheduleForEndedContract(rows, "2026-07-14");
    expect(filtered.map((row) => row.periodStart)).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
      "2026-07-01",
    ]);
  });
});

describe("hasPostEndPrepaidRows", () => {
  it("detects prepaid rows after contract end", () => {
    expect(hasPostEndPrepaidRows(rows, "2026-07-14")).toBe(true);
    expect(hasPostEndPrepaidRows(rows, "2026-07-20")).toBe(false);
  });
});

describe("buildHireScheduleRefundMarksByRowId", () => {
  it("marks prepaid post-end rent rows refunded in period order", () => {
    const marked = buildHireScheduleRefundMarksByRowId(
      [
        { id: "d1", rowKind: "deposit", periodStart: "2026-07-23", paidGbp: 300 },
        { id: "r1", rowKind: "rent", periodStart: "2026-07-23", paidGbp: 70 },
        { id: "r2", rowKind: "rent", periodStart: "2026-07-28", paidGbp: 110 },
        { id: "r3", rowKind: "rent", periodStart: "2026-08-04", paidGbp: 110 },
        { id: "r4", rowKind: "rent", periodStart: "2026-08-11", paidGbp: 110 },
      ],
      "2026-07-27",
      { prepaidRentRefundedGbp: 330, depositRefundedGbp: 0 },
    );
    expect(marked.get("r2")).toBe("refunded");
    expect(marked.get("r3")).toBe("refunded");
    expect(marked.get("r4")).toBe("refunded");
    expect(marked.has("r1")).toBe(false);
    expect(marked.has("d1")).toBe(false);
  });

  it("marks a partial prepaid refund and a deposit refund", () => {
    const marked = buildHireScheduleRefundMarksByRowId(
      [
        { id: "d1", rowKind: "deposit", periodStart: "2026-07-23", paidGbp: 300 },
        { id: "r2", rowKind: "rent", periodStart: "2026-07-28", paidGbp: 110 },
      ],
      "2026-07-27",
      { prepaidRentRefundedGbp: 50, depositRefundedGbp: 100 },
    );
    expect(marked.get("r2")).toBe("partial");
    expect(marked.get("d1")).toBe("partial");
  });
});
