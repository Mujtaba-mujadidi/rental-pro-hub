import { describe, expect, it } from "vitest";
import {
  accruedRentDueGbp,
  buildSubcompanyAttentionSummary,
  countUnsignedLiveAgreements,
  dedupeAttentionItemsById,
  dueStatusForDaysRemaining,
  filterCounts,
  filterSubcompanyAttentionItems,
  isLiveHireAgreement,
  overdueRentDueGbp,
  overdueRentDueLabel,
  pickContractAttentionEndDate,
  sortSubcompanyAttentionItems,
  type SubcompanyAttentionItem,
} from "@/lib/rental/subcompany-attention-display";
import { subcompanyOverviewHealth } from "@/lib/rental/subcompany-overview-display";

function item(
  partial: Partial<SubcompanyAttentionItem> & Pick<SubcompanyAttentionItem, "id" | "category" | "urgency">,
): SubcompanyAttentionItem {
  return {
    title: "Item",
    description: "Detail",
    meta: "AB12 CDE · Active driver",
    dueStatusLabel: "Due now",
    dueStatusTone: "urgent",
    amountGbp: null,
    amountLabel: "—",
    primaryActionLabel: "Open",
    primaryActionHref: "/rental/hires/1",
    priority: 0,
    dueSortDays: 0,
    newestSortKey: "2026-08-15",
    ...partial,
  };
}

const rentRow = (
  partial: Partial<{
    id: string;
    periodStart: string;
    periodEnd: string;
    baseAmountGbp: number;
    discountTotalGbp: number;
    paymentStatus: "not_received" | "approved";
    approvedAmountGbp: number | null;
  }>,
) => ({
  id: partial.id ?? "r",
  periodStart: partial.periodStart ?? "2026-08-10",
  periodEnd: partial.periodEnd ?? "2026-08-10",
  rowKind: "rent" as const,
  baseAmountGbp: partial.baseAmountGbp ?? 40,
  discountTotalGbp: partial.discountTotalGbp ?? 0,
  paymentStatus: partial.paymentStatus ?? ("not_received" as const),
  approvedAmountGbp: partial.approvedAmountGbp ?? null,
  pendingSubmittedGbp: null,
  sortOrder: 0,
});

describe("subcompany attention display", () => {
  it("builds summary counts and overdue rent from schedule arrears only", () => {
    const summary = buildSubcompanyAttentionSummary([
      item({
        id: "hire-rent-1",
        category: "rent",
        urgency: "urgent",
        amountGbp: 110,
        amountLabel: "GBP 110.00",
      }),
      item({
        id: "hire-settle-1",
        category: "rent",
        urgency: "urgent",
        amountGbp: 50,
        amountLabel: "GBP 50.00",
      }),
      item({ id: "2", category: "documents", urgency: "due_soon", priority: 1 }),
      item({ id: "3", category: "contracts", urgency: "upcoming", priority: 2 }),
      item({ id: "4", category: "contracts", urgency: "resolved", priority: 9 }),
    ]);
    expect(summary.urgentCount).toBe(2);
    expect(summary.overdueRentGbp).toBe(110);
    expect(summary.overdueRentLabel).toBe("GBP 110.00");
    expect(summary.documentsCount).toBe(1);
    expect(summary.contractsCount).toBe(1);
    expect(summary.openCount).toBe(4);
  });

  it("excludes current-period rent from overdue totals but keeps it in accrued", () => {
    const rows = [
      rentRow({
        id: "1",
        periodStart: "2026-08-10",
        periodEnd: "2026-08-10",
        baseAmountGbp: 40,
        discountTotalGbp: 5,
      }),
      rentRow({
        id: "2",
        periodStart: "2026-08-15",
        periodEnd: "2026-08-15",
        baseAmountGbp: 40,
      }),
      rentRow({
        id: "3",
        periodStart: "2026-08-20",
        periodEnd: "2026-08-20",
        baseAmountGbp: 40,
      }),
    ];
    const overdue = overdueRentDueGbp(rows, "2026-08-15");
    const accrued = accruedRentDueGbp(rows, "2026-08-15");
    expect(overdue.totalGbp).toBe(35);
    expect(overdue.unpaidPeriodCount).toBe(1);
    expect(overdue.oldestUnpaidPeriodEnd).toBe("2026-08-10");
    expect(accrued.totalGbp).toBe(75);
    expect(accrued.unpaidPeriodCount).toBe(2);
  });

  it("filters open vs resolved and sorts by priority / due / newest", () => {
    const items = [
      item({ id: "a", category: "documents", urgency: "due_soon", priority: 2, title: "B", dueSortDays: 3, newestSortKey: "2026-08-14" }),
      item({ id: "b", category: "rent", urgency: "urgent", priority: 0, title: "A", dueSortDays: -5, newestSortKey: "2026-08-10" }),
      item({ id: "c", category: "contracts", urgency: "resolved", priority: 9, dueSortDays: 10_000, newestSortKey: "2026-08-15" }),
    ];
    expect(filterSubcompanyAttentionItems(items, "all").map((i) => i.id)).toEqual(["a", "b"]);
    expect(filterSubcompanyAttentionItems(items, "resolved")).toHaveLength(1);
    expect(filterCounts(items).all).toBe(2);
    expect(sortSubcompanyAttentionItems(items, "priority").map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortSubcompanyAttentionItems(items, "due_date").map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortSubcompanyAttentionItems(items, "newest").map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("ignores cancelled/superseded agreements for end date and unsigned counts", () => {
    expect(isLiveHireAgreement("cancelled")).toBe(false);
    expect(isLiveHireAgreement("superseded")).toBe(false);
    expect(isLiveHireAgreement("active")).toBe(true);
    expect(
      pickContractAttentionEndDate(
        [
          { end_date: "2026-01-01", status: "superseded" },
          { end_date: "2026-08-20", status: "active" },
          { end_date: "2026-08-10", status: "cancelled" },
        ],
        "2026-08-15",
      ),
    ).toBe("2026-08-20");
    expect(
      countUnsignedLiveAgreements([
        { signed_at: null, status: "pending_signature" },
        { signed_at: null, status: "cancelled" },
        { signed_at: "2026-08-01", status: "active" },
      ]),
    ).toBe(1);
  });

  it("dedupes by stable id and reconciles filter counts with open items", () => {
    const items = [
      item({ id: "same", category: "documents", urgency: "urgent" }),
      item({ id: "same", category: "documents", urgency: "urgent", title: "Dup" }),
      item({ id: "other", category: "rent", urgency: "urgent", amountGbp: 10, amountLabel: "GBP 10.00" }),
    ];
    const unique = dedupeAttentionItemsById(items);
    expect(unique).toHaveLength(2);
    const open = filterSubcompanyAttentionItems(unique, "all");
    const counts = filterCounts(unique);
    expect(counts.all).toBe(open.length);
    expect(counts.urgent).toBe(2);
    expect(buildSubcompanyAttentionSummary(unique).openCount).toBe(open.length);
  });

  it("formats due and overdue labels", () => {
    expect(dueStatusForDaysRemaining(-7).label).toBe("Expired 7 days ago");
    expect(dueStatusForDaysRemaining(0).urgency).toBe("urgent");
    expect(dueStatusForDaysRemaining(3).urgency).toBe("due_soon");
    expect(overdueRentDueLabel(5)).toBe("5 days overdue");
  });

  it("aligns overview health with attention open count", () => {
    expect(
      subcompanyOverviewHealth({
        openRequirementCount: 0,
        vehicleAttentionCount: 0,
        attentionOpenCount: 2,
      }),
    ).toBe("attention");
    expect(
      subcompanyOverviewHealth({
        openRequirementCount: 0,
        vehicleAttentionCount: 0,
        attentionOpenCount: 0,
      }),
    ).toBe("healthy");
  });
});
