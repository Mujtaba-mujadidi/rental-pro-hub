import {
  deriveHirePaymentDisplayStatus,
  hirePaymentDisplayStatusMeta,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

export type HirePaymentHealthLevel = "on_track" | "attention" | "at_risk";

export type HirePaymentAnalyticsRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  rowKind: "rent" | "deposit";
  periodLabel: string;
  netDueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  accrued: boolean;
  paymentStatus: HirePaymentStatus;
  pendingSubmittedGbp: number | null;
};

export type HirePaymentHealthSummary = {
  level: HirePaymentHealthLevel;
  headline: string;
  detail: string;
  onTimeCount: number;
  eligiblePeriodCount: number;
  onTimePercent: number | null;
  overdueCount: number;
  overdueTotalGbp: number;
  pendingApprovalCount: number;
  rejectedCount: number;
};

export type HirePaymentAttentionItem = {
  kind: "overdue" | "pending_approval" | "rejected" | "due";
  rowId: string;
  title: string;
  amountGbp: number;
};

export type HirePaymentChartPoint = {
  rowId: string;
  label: string;
  netDueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  displayStatus: HirePaymentDisplayStatus;
};

export type HireContractProgress = {
  daysOnHire: number;
  periodsPaidCount: number;
  periodsEndedCount: number;
  periodsTotalCount: number;
};

function rowInput(row: HirePaymentAnalyticsRow) {
  return {
    paymentStatus: row.paymentStatus,
    balanceGbp: row.balanceGbp,
    paidGbp: row.paidGbp,
    netDueGbp: row.netDueGbp,
    accrued: row.accrued,
    periodEnd: row.periodEnd,
  };
}

function displayStatus(row: HirePaymentAnalyticsRow, todayYmd: string): HirePaymentDisplayStatus {
  return deriveHirePaymentDisplayStatus(rowInput(row), todayYmd);
}

/** Whole calendar days from start (inclusive) to end (inclusive) in YYYY-MM-DD. */
export function calendarDaysInclusive(startYmd: string, endYmd: string): number {
  const start = Date.parse(`${startYmd}T00:00:00Z`);
  const end = Date.parse(`${endYmd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function hireDaysOnHire(startDateYmd: string, todayYmd: string): number {
  return calendarDaysInclusive(startDateYmd, todayYmd);
}

/** Ended periods with zero balance count as on time (v1 — no paid-at timestamp). */
export function analyzeHirePaymentHealth(
  rows: HirePaymentAnalyticsRow[],
  todayYmd: string,
): HirePaymentHealthSummary {
  let eligiblePeriodCount = 0;
  let onTimeCount = 0;
  let overdueCount = 0;
  let overdueTotalGbp = 0;
  let pendingApprovalCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    const status = displayStatus(row, todayYmd);
    if (status === "pending_approval") pendingApprovalCount += 1;
    if (status === "rejected") rejectedCount += 1;
    if (status === "overdue") {
      overdueCount += 1;
      overdueTotalGbp += row.balanceGbp;
    }

    if (row.periodEnd >= todayYmd) continue;
    eligiblePeriodCount += 1;
    if (row.balanceGbp <= 0) onTimeCount += 1;
  }

  overdueTotalGbp = Math.round(overdueTotalGbp * 100) / 100;
  const onTimePercent =
    eligiblePeriodCount > 0 ? Math.round((onTimeCount / eligiblePeriodCount) * 100) : null;

  let level: HirePaymentHealthLevel = "on_track";
  if (overdueCount >= 2) level = "at_risk";
  else if (overdueCount >= 1 || pendingApprovalCount > 0 || rejectedCount > 0) level = "attention";

  const headline =
    level === "on_track"
      ? "Payments on track"
      : level === "at_risk"
        ? "Payment risk"
        : "Needs attention";

  const detailParts: string[] = [];
  if (onTimePercent != null) detailParts.push(`${onTimePercent}% on time (${onTimeCount}/${eligiblePeriodCount} periods)`);
  if (overdueCount > 0) detailParts.push(`${overdueCount} overdue · £${overdueTotalGbp.toFixed(2)}`);
  if (pendingApprovalCount > 0) detailParts.push(`${pendingApprovalCount} pending approval`);
  if (rejectedCount > 0) detailParts.push(`${rejectedCount} rejected`);
  if (!detailParts.length) detailParts.push("No overdue periods");

  return {
    level,
    headline,
    detail: detailParts.join(" · "),
    onTimeCount,
    eligiblePeriodCount,
    onTimePercent,
    overdueCount,
    overdueTotalGbp,
    pendingApprovalCount,
    rejectedCount,
  };
}

export function buildHirePaymentAttentionItems(
  rows: HirePaymentAnalyticsRow[],
  todayYmd: string,
): HirePaymentAttentionItem[] {
  const items: HirePaymentAttentionItem[] = [];

  for (const row of rows) {
    const status = displayStatus(row, todayYmd);
    if (status === "overdue") {
      items.push({
        kind: "overdue",
        rowId: row.id,
        title: row.periodLabel,
        amountGbp: row.balanceGbp,
      });
    } else if (status === "pending_approval") {
      items.push({
        kind: "pending_approval",
        rowId: row.id,
        title: row.periodLabel,
        amountGbp: row.pendingSubmittedGbp ?? row.balanceGbp,
      });
    } else if (status === "rejected") {
      items.push({
        kind: "rejected",
        rowId: row.id,
        title: row.periodLabel,
        amountGbp: row.balanceGbp,
      });
    } else if (status === "due" && row.balanceGbp > 0) {
      items.push({
        kind: "due",
        rowId: row.id,
        title: row.periodLabel,
        amountGbp: row.balanceGbp,
      });
    }
  }

  const order: HirePaymentAttentionItem["kind"][] = [
    "overdue",
    "pending_approval",
    "rejected",
    "due",
  ];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function buildHirePaymentChartPoints(
  rows: HirePaymentAnalyticsRow[],
  todayYmd: string,
): HirePaymentChartPoint[] {
  return rows.map((row) => {
    const display = displayStatus(row, todayYmd);
    return {
      rowId: row.id,
      label: row.rowKind === "deposit" ? "Deposit" : row.periodLabel,
      netDueGbp: row.netDueGbp,
      paidGbp: row.paidGbp,
      balanceGbp: row.balanceGbp,
      displayStatus: display,
    };
  });
}

export function summarizeHireContractProgress(
  rows: HirePaymentAnalyticsRow[],
  startDateYmd: string,
  todayYmd: string,
): HireContractProgress {
  let periodsPaidCount = 0;
  let periodsEndedCount = 0;

  for (const row of rows) {
    if (row.periodEnd < todayYmd) periodsEndedCount += 1;
    if (row.balanceGbp <= 0) periodsPaidCount += 1;
  }

  return {
    daysOnHire: hireDaysOnHire(startDateYmd, todayYmd),
    periodsPaidCount,
    periodsEndedCount,
    periodsTotalCount: rows.length,
  };
}

export function depositStatusLabel(
  rows: HirePaymentAnalyticsRow[],
  todayYmd: string,
): string {
  const deposit = rows.find((r) => r.rowKind === "deposit");
  if (!deposit) return "Not required";
  return hirePaymentDisplayStatusMeta(displayStatus(deposit, todayYmd)).label;
}

export function formatHirePaymentEventSummary(input: {
  fromStatus: string | null;
  toStatus: string | null;
  actorRole: string;
  periodLabel: string;
  submittedAmountGbp?: number | null;
  eventKind?: string | null;
}): string {
  const amount =
    input.submittedAmountGbp != null && Number.isFinite(input.submittedAmountGbp)
      ? ` (£${input.submittedAmountGbp.toFixed(2)})`
      : "";
  const actor = input.actorRole === "driver" ? "Driver" : "Staff";

  if (input.eventKind === "amendment") {
    return `Payment amended for ${input.periodLabel}${amount}`;
  }
  if (input.toStatus === "pending_approval") {
    return `${actor} submitted payment for ${input.periodLabel}${amount}`;
  }
  if (input.toStatus === "approved") {
    return `Payment approved for ${input.periodLabel}${amount}`;
  }
  if (input.toStatus === "rejected") {
    return `Payment rejected for ${input.periodLabel}`;
  }
  return `Payment updated for ${input.periodLabel}`;
}
