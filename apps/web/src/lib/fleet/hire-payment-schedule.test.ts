import { describe, expect, it } from "vitest";
import {
  generateRentScheduleRows,
  netRowAmountGbp,
  withDepositRow,
} from "@/lib/fleet/hire-payment-schedule";

describe("generateRentScheduleRows", () => {
  it("generates weekly rows", () => {
    const rows = generateRentScheduleRows({
      startDate: "2026-01-01",
      endDate: "2026-01-21",
      cadence: "weekly",
      rentAmountGbp: 250,
    });
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ periodStart: "2026-01-01", baseAmountGbp: 250 });
  });

  it("returns empty for invalid range", () => {
    expect(
      generateRentScheduleRows({
        startDate: "2026-02-01",
        endDate: "2026-01-01",
        cadence: "weekly",
        rentAmountGbp: 100,
      }),
    ).toEqual([]);
  });
});

describe("withDepositRow", () => {
  it("prepends deposit", () => {
    const base = generateRentScheduleRows({
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      cadence: "weekly",
      rentAmountGbp: 100,
    });
    const withDep = withDepositRow(base, 500, "2026-01-01");
    expect(withDep[0]?.rowKind).toBe("deposit");
    expect(withDep[0]?.baseAmountGbp).toBe(500);
  });
});

describe("netRowAmountGbp", () => {
  it("subtracts discounts floored at zero", () => {
    expect(netRowAmountGbp(250, 50)).toBe(200);
    expect(netRowAmountGbp(100, 150)).toBe(0);
  });
});
