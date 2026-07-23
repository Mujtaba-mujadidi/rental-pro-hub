import { describe, expect, it } from "vitest";
import {
  analyzeHirePaymentHealth,
  buildHirePaymentAttentionItems,
  buildHirePaymentChartPoints,
  calendarDaysInclusive,
  depositStatusLabel,
  formatHirePaymentEventSummary,
  hireDaysOnHire,
  summarizeHireContractProgress,
  type HirePaymentAnalyticsRow,
} from "@/lib/fleet/hire-payment-analytics";

const rows: HirePaymentAnalyticsRow[] = [
  {
    id: "dep",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-01",
    rowKind: "deposit",
    periodLabel: "Deposit",
    netDueGbp: 500,
    paidGbp: 500,
    balanceGbp: 0,
    accrued: true,
    paymentStatus: "approved",
    pendingSubmittedGbp: null,
  },
  {
    id: "w1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-07",
    rowKind: "rent",
    periodLabel: "1 Jul – 7 Jul 2026",
    netDueGbp: 250,
    paidGbp: 250,
    balanceGbp: 0,
    accrued: true,
    paymentStatus: "approved",
    pendingSubmittedGbp: null,
  },
  {
    id: "w2",
    periodStart: "2026-07-08",
    periodEnd: "2026-07-14",
    rowKind: "rent",
    periodLabel: "8 Jul – 14 Jul 2026",
    netDueGbp: 250,
    paidGbp: 0,
    balanceGbp: 250,
    accrued: true,
    paymentStatus: "not_received",
    pendingSubmittedGbp: null,
  },
  {
    id: "w3",
    periodStart: "2026-07-15",
    periodEnd: "2026-07-21",
    rowKind: "rent",
    periodLabel: "15 Jul – 21 Jul 2026",
    netDueGbp: 250,
    paidGbp: 0,
    balanceGbp: 250,
    accrued: false,
    paymentStatus: "not_received",
    pendingSubmittedGbp: null,
  },
];

describe("hire-payment-analytics", () => {
  it("counts inclusive calendar days", () => {
    expect(calendarDaysInclusive("2026-07-01", "2026-07-01")).toBe(1);
    expect(calendarDaysInclusive("2026-07-01", "2026-07-10")).toBe(10);
    expect(hireDaysOnHire("2026-07-01", "2026-07-10")).toBe(10);
  });

  it("flags attention when a period is overdue", () => {
    const health = analyzeHirePaymentHealth(rows, "2026-07-20");
    expect(health.level).toBe("attention");
    expect(health.overdueCount).toBe(1);
    expect(health.overdueTotalGbp).toBe(250);
    expect(health.onTimePercent).toBe(67);
  });

  it("is on track when ended periods are paid", () => {
    const paidRows = rows.map((r) =>
      r.id === "w2" ? { ...r, paidGbp: 250, balanceGbp: 0, paymentStatus: "approved" as const } : r,
    );
    const health = analyzeHirePaymentHealth(paidRows, "2026-07-20");
    expect(health.level).toBe("on_track");
    expect(health.overdueCount).toBe(0);
  });

  it("marks at risk with multiple overdue periods", () => {
    const overdueRows = rows.map((r) =>
      r.rowKind === "rent" && r.periodEnd < "2026-07-20"
        ? { ...r, balanceGbp: 250, paidGbp: 0 }
        : r,
    );
    const health = analyzeHirePaymentHealth(overdueRows, "2026-07-20");
    expect(health.level).toBe("at_risk");
    expect(health.overdueCount).toBe(2);
  });

  it("builds attention items in priority order", () => {
    const pendingRow: HirePaymentAnalyticsRow = {
      ...rows[2]!,
      paymentStatus: "pending_approval",
      pendingSubmittedGbp: 250,
    };
    const items = buildHirePaymentAttentionItems([pendingRow, rows[2]!], "2026-07-20");
    expect(items[0]?.kind).toBe("overdue");
    expect(items.some((i) => i.kind === "pending_approval")).toBe(true);
  });

  it("builds chart points with display status", () => {
    const points = buildHirePaymentChartPoints(rows, "2026-07-20");
    expect(points.find((p) => p.rowId === "w2")?.displayStatus).toBe("overdue");
    expect(points.find((p) => p.rowId === "w3")?.displayStatus).toBe("upcoming");
  });

  it("summarizes contract progress", () => {
    const progress = summarizeHireContractProgress(rows, "2026-07-01", "2026-07-20");
    expect(progress.daysOnHire).toBe(20);
    expect(progress.periodsEndedCount).toBe(3);
    expect(progress.periodsTotalCount).toBe(4);
  });

  it("labels deposit status", () => {
    expect(depositStatusLabel(rows, "2026-07-10")).toBe("Paid");
    expect(depositStatusLabel([], "2026-07-10")).toBe("Not required");
  });

  it("formats payment event summaries", () => {
    expect(
      formatHirePaymentEventSummary({
        fromStatus: "not_received",
        toStatus: "pending_approval",
        actorRole: "driver",
        periodLabel: "8 Jul – 14 Jul 2026",
        submittedAmountGbp: 250,
      }),
    ).toContain("Driver submitted");
    expect(
      formatHirePaymentEventSummary({
        fromStatus: "pending_approval",
        toStatus: "approved",
        actorRole: "company_staff",
        periodLabel: "8 Jul – 14 Jul 2026",
      }),
    ).toContain("approved");
  });
});
