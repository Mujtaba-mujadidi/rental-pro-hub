import { describe, expect, it } from "vitest";
import {
  accruedRentDueGbp,
  buildSubcompanyAttentionSummary,
  dueStatusForDaysRemaining,
  filterCounts,
  filterSubcompanyAttentionItems,
  overdueRentDueLabel,
  sortSubcompanyAttentionItems,
  type SubcompanyAttentionItem,
} from "@/lib/rental/subcompany-attention-display";

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
    ...partial,
  };
}

describe("subcompany attention display", () => {
  it("builds summary counts and overdue rent total", () => {
    const summary = buildSubcompanyAttentionSummary([
      item({
        id: "1",
        category: "rent",
        urgency: "urgent",
        amountGbp: 110,
        amountLabel: "£110.00",
      }),
      item({ id: "2", category: "documents", urgency: "due_soon", priority: 1 }),
      item({ id: "3", category: "contracts", urgency: "upcoming", priority: 2 }),
      item({ id: "4", category: "contracts", urgency: "resolved", priority: 9 }),
    ]);
    expect(summary.urgentCount).toBe(1);
    expect(summary.overdueRentGbp).toBe(110);
    expect(summary.overdueRentLabel).toBe("GBP 110.00");
    expect(summary.documentsCount).toBe(1);
    expect(summary.contractsCount).toBe(1);
    expect(summary.openCount).toBe(3);
  });

  it("sums accrued rent due including the current period, net of discounts", () => {
    const due = accruedRentDueGbp(
      [
        {
          id: "1",
          periodStart: "2026-08-10",
          periodEnd: "2026-08-10",
          rowKind: "rent",
          baseAmountGbp: 40,
          discountTotalGbp: 5,
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          pendingSubmittedGbp: null,
          sortOrder: 0,
        },
        {
          id: "2",
          periodStart: "2026-08-15",
          periodEnd: "2026-08-15",
          rowKind: "rent",
          baseAmountGbp: 40,
          discountTotalGbp: 0,
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          pendingSubmittedGbp: null,
          sortOrder: 1,
        },
        {
          id: "3",
          periodStart: "2026-08-20",
          periodEnd: "2026-08-20",
          rowKind: "rent",
          baseAmountGbp: 40,
          discountTotalGbp: 0,
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          pendingSubmittedGbp: null,
          sortOrder: 2,
        },
      ],
      "2026-08-15",
    );
    // Past + current accrued unpaid; future excluded. Discount applied on first period.
    expect(due.totalGbp).toBe(75);
    expect(due.unpaidPeriodCount).toBe(2);
    expect(due.oldestUnpaidPeriodEnd).toBe("2026-08-10");
  });

  it("filters open vs resolved and sorts by priority", () => {
    const items = [
      item({ id: "a", category: "documents", urgency: "due_soon", priority: 2, title: "B" }),
      item({ id: "b", category: "rent", urgency: "urgent", priority: 0, title: "A" }),
      item({ id: "c", category: "contracts", urgency: "resolved", priority: 9 }),
    ];
    expect(filterSubcompanyAttentionItems(items, "all").map((i) => i.id)).toEqual(["a", "b"]);
    expect(filterSubcompanyAttentionItems(items, "resolved")).toHaveLength(1);
    expect(filterCounts(items).all).toBe(2);
    expect(sortSubcompanyAttentionItems(items, "priority").map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("formats due and overdue labels", () => {
    expect(dueStatusForDaysRemaining(-7).label).toBe("Expired 7 days ago");
    expect(dueStatusForDaysRemaining(0).urgency).toBe("urgent");
    expect(dueStatusForDaysRemaining(3).urgency).toBe("due_soon");
    expect(overdueRentDueLabel(5)).toBe("5 days overdue");
  });
});
