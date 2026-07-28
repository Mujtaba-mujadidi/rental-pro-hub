import { describe, expect, it } from "vitest";
import {
  filterPaymentScheduleForEndedContract,
  hasPostEndPrepaidRows,
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
