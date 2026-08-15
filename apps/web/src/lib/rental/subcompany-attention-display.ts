import { daysFromCalendarDateToExpiry, formatUkDateText } from "@/lib/datetime/uk";
import {
  hirePaymentRowBalanceGbp,
  isHirePaymentRowAccrued,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";

export type SubcompanyAttentionCategory = "rent" | "contracts" | "documents";

export type SubcompanyAttentionUrgency = "urgent" | "due_soon" | "upcoming" | "resolved";

export type SubcompanyAttentionFilter =
  | "all"
  | "urgent"
  | "rent"
  | "contracts"
  | "documents"
  | "resolved";

export type SubcompanyAttentionSort = "priority" | "amount";

export type SubcompanyAttentionItem = {
  id: string;
  category: SubcompanyAttentionCategory;
  urgency: SubcompanyAttentionUrgency;
  title: string;
  description: string;
  meta: string;
  dueStatusLabel: string;
  dueStatusTone: "urgent" | "warn" | "neutral" | "ok";
  amountGbp: number | null;
  amountLabel: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  /** Lower = higher priority. */
  priority: number;
};

export type SubcompanyAttentionSummary = {
  urgentCount: number;
  overdueRentGbp: number;
  overdueRentLabel: string;
  contractsCount: number;
  documentsCount: number;
  openCount: number;
};

export const SUBCOMPANY_ATTENTION_FILTERS: Array<{
  value: SubcompanyAttentionFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "urgent", label: "Urgent" },
  { value: "rent", label: "Rent" },
  { value: "contracts", label: "Contracts" },
  { value: "documents", label: "Documents" },
  { value: "resolved", label: "Resolved" },
];

export const SUBCOMPANY_ATTENTION_SORT_OPTIONS: Array<{
  value: SubcompanyAttentionSort;
  label: string;
}> = [
  { value: "priority", label: "Priority first" },
  { value: "amount", label: "Highest amount" },
];

export function formatAttentionAmountDigits(amountGbp: number): string {
  const n = Math.round(amountGbp * 100) / 100;
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAttentionAmount(amountGbp: number | null): string {
  if (amountGbp == null || !Number.isFinite(amountGbp)) return "—";
  // Prefer "GBP" over the £ glyph — Geist (and some fallbacks) draw £ incorrectly.
  return `GBP ${formatAttentionAmountDigits(amountGbp)}`;
}

/**
 * Outstanding rent on accrued schedule rows (period started), after discounts.
 * Includes the current period — not only periods whose end date has passed.
 */
export function accruedRentDueGbp(
  rows: readonly HirePaymentScheduleRowInput[],
  todayYmd: string,
): { totalGbp: number; unpaidPeriodCount: number; oldestUnpaidPeriodEnd: string | null } {
  let totalGbp = 0;
  let unpaidPeriodCount = 0;
  let oldestUnpaidPeriodEnd: string | null = null;
  for (const row of rows) {
    if (row.rowKind !== "rent") continue;
    if (!isHirePaymentRowAccrued(row, todayYmd)) continue;
    const balance = hirePaymentRowBalanceGbp(row);
    if (balance <= 0.005) continue;
    totalGbp = Math.round((totalGbp + balance) * 100) / 100;
    unpaidPeriodCount += 1;
    if (!oldestUnpaidPeriodEnd || row.periodEnd < oldestUnpaidPeriodEnd) {
      oldestUnpaidPeriodEnd = row.periodEnd;
    }
  }
  return { totalGbp, unpaidPeriodCount, oldestUnpaidPeriodEnd };
}

export function buildSubcompanyAttentionSummary(
  items: readonly SubcompanyAttentionItem[],
): SubcompanyAttentionSummary {
  const open = items.filter((item) => item.urgency !== "resolved");
  let overdueRentGbp = 0;
  for (const item of open) {
    if (item.category === "rent" && item.amountGbp != null && item.amountGbp > 0) {
      overdueRentGbp += item.amountGbp;
    }
  }
  overdueRentGbp = Math.round(overdueRentGbp * 100) / 100;
  return {
    urgentCount: open.filter((item) => item.urgency === "urgent").length,
    overdueRentGbp,
    overdueRentLabel: formatAttentionAmount(overdueRentGbp),
    contractsCount: open.filter((item) => item.category === "contracts").length,
    documentsCount: open.filter((item) => item.category === "documents").length,
    openCount: open.length,
  };
}

export function filterCounts(items: readonly SubcompanyAttentionItem[]): Record<
  SubcompanyAttentionFilter,
  number
> {
  const open = items.filter((item) => item.urgency !== "resolved");
  return {
    all: open.length,
    urgent: open.filter((item) => item.urgency === "urgent").length,
    rent: open.filter((item) => item.category === "rent").length,
    contracts: open.filter((item) => item.category === "contracts").length,
    documents: open.filter((item) => item.category === "documents").length,
    resolved: items.filter((item) => item.urgency === "resolved").length,
  };
}

export function filterSubcompanyAttentionItems(
  items: readonly SubcompanyAttentionItem[],
  filter: SubcompanyAttentionFilter,
): SubcompanyAttentionItem[] {
  if (filter === "all") {
    return items.filter((item) => item.urgency !== "resolved");
  }
  if (filter === "urgent") {
    return items.filter((item) => item.urgency === "urgent");
  }
  if (filter === "resolved") {
    return items.filter((item) => item.urgency === "resolved");
  }
  return items.filter((item) => item.category === filter && item.urgency !== "resolved");
}

export function sortSubcompanyAttentionItems(
  items: readonly SubcompanyAttentionItem[],
  sort: SubcompanyAttentionSort,
): SubcompanyAttentionItem[] {
  const copy = [...items];
  if (sort === "amount") {
    copy.sort(
      (a, b) =>
        (b.amountGbp ?? 0) - (a.amountGbp ?? 0) ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title),
    );
    return copy;
  }
  copy.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return copy;
}

export function dueStatusForDaysRemaining(days: number): {
  label: string;
  tone: SubcompanyAttentionItem["dueStatusTone"];
  urgency: SubcompanyAttentionUrgency;
} {
  if (days < 0) {
    const n = Math.abs(days);
    return {
      label: n === 1 ? "Expired yesterday" : `Expired ${n} days ago`,
      tone: "urgent",
      urgency: "urgent",
    };
  }
  if (days === 0) {
    return { label: "Due now", tone: "urgent", urgency: "urgent" };
  }
  if (days <= 7) {
    return {
      label: days === 1 ? "1 day remaining" : `${days} days remaining`,
      tone: "warn",
      urgency: "due_soon",
    };
  }
  return {
    label: `${days} days remaining`,
    tone: "neutral",
    urgency: "upcoming",
  };
}

export function overdueRentDueLabel(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Due now";
  if (daysOverdue === 1) return "1 day overdue";
  return `${daysOverdue} days overdue`;
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number | null {
  return daysFromCalendarDateToExpiry(toYmd, fromYmd);
}

export function resolvedCompletedLabel(isoOrYmd: string): string {
  const day = formatUkDateText(isoOrYmd.slice(0, 10));
  return day === "—" ? "Resolved" : `Resolved ${day}`;
}

export function buildSubcompanyAttentionExportCsv(
  items: readonly SubcompanyAttentionItem[],
): string {
  const header = [
    "Category",
    "Urgency",
    "Title",
    "Description",
    "Meta",
    "Due status",
    "Amount",
    "Action",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const item of items) {
    lines.push(
      [
        item.category,
        item.urgency,
        item.title,
        item.description,
        item.meta,
        item.dueStatusLabel,
        item.amountLabel,
        item.primaryActionHref,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function attentionPriority(input: {
  urgency: SubcompanyAttentionUrgency;
  category: SubcompanyAttentionCategory;
}): number {
  const urgencyRank: Record<SubcompanyAttentionUrgency, number> = {
    urgent: 0,
    due_soon: 1,
    upcoming: 2,
    resolved: 9,
  };
  const categoryRank: Record<SubcompanyAttentionCategory, number> = {
    rent: 0,
    documents: 1,
    contracts: 2,
  };
  return urgencyRank[input.urgency] * 10 + categoryRank[input.category];
}
