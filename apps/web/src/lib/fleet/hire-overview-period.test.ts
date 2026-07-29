import { describe, expect, it } from "vitest";
import {
  hireFrequencyPeriodNumberFromDates,
  hireFrequencyPeriodNumberFromRows,
  hireFrequencyPosition,
  hireFrequencyPositionLabel,
} from "@/lib/fleet/hire-overview-period";

describe("hire-overview-period", () => {
  it("labels daily, weekly, and monthly positions", () => {
    expect(hireFrequencyPositionLabel("daily", 9)).toBe("Day 9");
    expect(hireFrequencyPositionLabel("weekly", 8)).toBe("Week 8");
    expect(hireFrequencyPositionLabel("monthly", 2)).toBe("Month 2");
  });

  it("counts started rent rows for frequency position", () => {
    const rows = [
      { rowKind: "deposit", periodStart: "2026-07-23" },
      { rowKind: "rent", periodStart: "2026-07-23" },
      { rowKind: "rent", periodStart: "2026-07-30" },
      { rowKind: "rent", periodStart: "2026-08-06" },
    ];
    expect(hireFrequencyPeriodNumberFromRows(rows, "2026-07-28")).toBe(1);
    expect(hireFrequencyPeriodNumberFromRows(rows, "2026-08-01")).toBe(2);
  });

  it("falls back to date math for weekly hires", () => {
    expect(hireFrequencyPeriodNumberFromDates("weekly", "2026-07-23", "2026-07-29")).toBe(1);
    expect(hireFrequencyPeriodNumberFromDates("weekly", "2026-07-23", "2026-07-30")).toBe(2);
  });

  it("builds position from schedule rows when present", () => {
    expect(
      hireFrequencyPosition({
        cadence: "weekly",
        startDateYmd: "2026-07-23",
        referenceYmd: "2026-08-05",
        scheduleRows: [
          { rowKind: "rent", periodStart: "2026-07-23" },
          { rowKind: "rent", periodStart: "2026-07-30" },
          { rowKind: "rent", periodStart: "2026-08-06" },
        ],
      }),
    ).toBe("Week 2");
  });
});
