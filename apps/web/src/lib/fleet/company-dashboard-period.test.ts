import { describe, expect, it } from "vitest";
import {
  chartMonthKeysForPeriod,
  lastMonthKeysEndingAt,
  monthBucketLabel,
  resolveCompanyDashboardPeriod,
} from "@/lib/fleet/company-dashboard-period";

describe("resolveCompanyDashboardPeriod", () => {
  it("resolves this month through today with previous equivalent window", () => {
    const period = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd: "2026-08-14" });
    expect(period).toMatchObject({
      kind: "this_month",
      startYmd: "2026-08-01",
      endYmd: "2026-08-14",
      previousStartYmd: "2026-07-18",
      previousEndYmd: "2026-07-31",
      label: "This month",
    });
  });

  it("resolves last month as a full calendar month", () => {
    const period = resolveCompanyDashboardPeriod({ kind: "last_month", todayYmd: "2026-08-14" });
    expect(period).toMatchObject({
      kind: "last_month",
      startYmd: "2026-07-01",
      endYmd: "2026-07-31",
      previousStartYmd: "2026-05-31",
      previousEndYmd: "2026-06-30",
    });
  });

  it("resolves this quarter and this year", () => {
    expect(resolveCompanyDashboardPeriod({ kind: "this_quarter", todayYmd: "2026-08-14" })).toMatchObject({
      startYmd: "2026-07-01",
      endYmd: "2026-08-14",
    });
    expect(resolveCompanyDashboardPeriod({ kind: "this_year", todayYmd: "2026-08-14" })).toMatchObject({
      startYmd: "2026-01-01",
      endYmd: "2026-08-14",
    });
  });

  it("validates custom ranges", () => {
    expect(
      resolveCompanyDashboardPeriod({
        kind: "custom",
        todayYmd: "2026-08-14",
        customStartYmd: "2026-08-20",
        customEndYmd: "2026-08-10",
      }),
    ).toEqual({ error: "Custom period start must be on or before the end date." });

    expect(
      resolveCompanyDashboardPeriod({
        kind: "custom",
        todayYmd: "2026-08-14",
        customStartYmd: "2026-08-01",
        customEndYmd: "2026-08-20",
      }),
    ).toEqual({ error: "Custom period cannot end after today." });

    const ok = resolveCompanyDashboardPeriod({
      kind: "custom",
      todayYmd: "2026-08-14",
      customStartYmd: "2026-08-01",
      customEndYmd: "2026-08-10",
    });
    expect(ok).toMatchObject({ startYmd: "2026-08-01", endYmd: "2026-08-10" });
  });
});

describe("chart month helpers", () => {
  it("builds six trailing months for this month", () => {
    const period = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd: "2026-08-14" });
    if ("error" in period) throw new Error(period.error);
    expect(chartMonthKeysForPeriod(period)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("labels months in en-GB short form", () => {
    expect(monthBucketLabel("2026-08")).toBe("Aug");
    expect(lastMonthKeysEndingAt("2026-01-15", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});
