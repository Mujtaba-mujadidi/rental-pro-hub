import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { formatUkDate } from "@/lib/datetime/uk";
import {
  deriveHirePaymentDisplayStatus,
  hirePaymentDisplayStatusMeta,
  type HirePaymentDisplayOptions,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { ActiveHirePaymentPosition } from "@/lib/fleet/hire-active-summary-display";
import { buildActiveHirePaymentPosition } from "@/lib/fleet/hire-active-summary-display";

const UPCOMING_STATUSES = new Set<HirePaymentDisplayStatus>([
  "due",
  "overdue",
  "partially_paid",
  "pending_approval",
  "rejected",
  "upcoming",
]);

const PAID_STATUSES = new Set<HirePaymentDisplayStatus>([
  "paid",
  "cleared",
  "waived",
  "prepaid_settled",
  "prepaid_refunded",
  "prepaid_partially_refunded",
  "refunded",
]);

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T12:00:00`);
  const to = Date.parse(`${toYmd}T12:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function buildActiveHirePaymentPositionFromPage(input: {
  summary: HirePaymentSummary;
  paymentRows: readonly Pick<HirePaymentPageRow, "rowKind" | "balanceGbp" | "netDueGbp">[];
  includeDeposit: boolean;
  extraChargesOutstandingGbp?: number;
  audience?: "staff" | "driver";
}): ActiveHirePaymentPosition {
  return buildActiveHirePaymentPosition({
    includeDeposit: input.includeDeposit,
    summary: input.summary,
    paymentRows: input.paymentRows,
    extraChargesOutstandingGbp: input.extraChargesOutstandingGbp,
    audience: input.audience,
  });
}

export function upcomingPaymentPeriodLabel(row: Pick<HirePaymentPageRow, "rowKind" | "periodStart" | "periodEnd">): string {
  if (row.rowKind === "deposit") return "Deposit";
  if (row.periodStart === row.periodEnd) return formatUkDate(row.periodStart);
  return `${formatUkDate(row.periodStart)} – ${formatUkDate(row.periodEnd)}`;
}

export function upcomingPaymentStatusLabel(
  row: HirePaymentPageRow,
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
): { label: string; tone: ReturnType<typeof hirePaymentDisplayStatusMeta>["tone"] } {
  const status = deriveHirePaymentDisplayStatus(row, todayYmd, options);
  const meta = hirePaymentDisplayStatusMeta(status, options);
  if (status === "due" && row.periodStart === todayYmd) {
    return { label: "Due today", tone: meta.tone };
  }
  return meta;
}

export function selectUpcomingPaymentRows(
  rows: readonly HirePaymentPageRow[],
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
  limit = 8,
): HirePaymentPageRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
    return a.sortOrder - b.sortOrder;
  });

  const selected: HirePaymentPageRow[] = [];
  for (const row of sorted) {
    const status = deriveHirePaymentDisplayStatus(row, todayYmd, options);
    if (PAID_STATUSES.has(status)) continue;
    if (!UPCOMING_STATUSES.has(status)) continue;
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function formatNextPaymentHeading(periodStart: string, todayYmd: string): string {
  const dateLabel = formatUkDate(periodStart);
  const offset = daysBetweenYmd(todayYmd, periodStart);
  if (offset === 0) return `Today - ${dateLabel}`;
  if (offset === 1) return `Tomorrow - ${dateLabel}`;
  return dateLabel;
}

export function rentDueToDateHint(rentMetricLabel: string, frequencyPositionLabel?: string | null): string {
  if (frequencyPositionLabel?.trim()) return frequencyPositionLabel;
  const normalized = rentMetricLabel.toLowerCase();
  if (normalized.includes("daily")) return "Past daily rental period";
  if (normalized.includes("week")) return "Past weekly rental period";
  if (normalized.includes("month")) return "Past monthly rental period";
  return "Accrued rental periods";
}

export function rentPaymentPeriodSubtitle(rentMetricLabel: string): string {
  const label = rentMetricLabel.trim();
  if (!label) return "Rent payment";
  if (label.toLowerCase().endsWith("rent")) return `${label} payment`;
  return `${label} rent payment`;
}

export function buildFullPaymentScheduleSummary(
  rows: readonly Pick<HirePaymentPageRow, "rowKind">[],
  contractTotalGbp: number,
): string {
  const rentCount = rows.filter((row) => row.rowKind === "rent").length;
  const periodLabel = rentCount === 1 ? "rent period" : "rent periods";
  return `${rentCount} ${periodLabel} = ${formatGbp(contractTotalGbp)} before any future changes`;
}

export function depositOutstandingHint(
  depositOutstandingGbp: number,
  depositPaidGbp: number,
): string {
  if (depositOutstandingGbp <= 0.005) return "No deposit due";
  if (depositPaidGbp <= 0.005) return "No deposit payment recorded";
  return "Deposit balance still outstanding";
}

export function rentPaidStatHint(rentPaidGbp: number, rentOutstandingGbp: number): string {
  if (rentOutstandingGbp > 0.005) return `Outstanding rent: ${formatGbp(rentOutstandingGbp)}`;
  if (rentPaidGbp <= 0.005) return "No rent recorded yet";
  return "Recorded on this hire";
}

export function extraChargesOutstandingHint(outstandingGbp: number): string {
  if (outstandingGbp <= 0.005) return "No extra charges due";
  return "Damage, admin and other charges";
}

/** Outstanding deposit that can still take a payment (excludes pending approval). */
export function depositOutstandingGbp(
  rows: readonly Pick<HirePaymentPageRow, "rowKind" | "balanceGbp" | "paymentStatus">[],
): number {
  let total = 0;
  for (const row of rows) {
    if (row.rowKind !== "deposit") continue;
    if (row.balanceGbp <= 0.005) continue;
    if (row.paymentStatus === "pending_approval") continue;
    total += row.balanceGbp;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Shortcut amount for “pay balance to date”: accrued rent still owed plus any
 * outstanding deposit that can still take a payment. Rows awaiting approval are
 * excluded (same rule as allocation), so we do not double-ask for money already submitted.
 */
export function payBalanceToDateGbp(
  rows: readonly Pick<
    HirePaymentPageRow,
    "rowKind" | "balanceGbp" | "paymentStatus" | "accrued"
  >[],
  options?: { includeDeposit?: boolean },
): number {
  const includeDeposit = options?.includeDeposit !== false;
  let total = 0;
  for (const row of rows) {
    if (row.balanceGbp <= 0.005) continue;
    if (row.paymentStatus === "pending_approval") continue;
    if (row.rowKind === "deposit") {
      if (includeDeposit) total += row.balanceGbp;
      continue;
    }
    if (row.accrued) {
      total += row.balanceGbp;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Accrued rent still owed after discounts. Excludes deposit, future periods, and pending rows. */
export function accruedRentOutstandingGbp(
  rows: readonly Pick<
    HirePaymentPageRow,
    "rowKind" | "balanceGbp" | "paymentStatus" | "accrued"
  >[],
): number {
  let total = 0;
  for (const row of rows) {
    if (row.rowKind !== "rent") continue;
    if (!row.accrued) continue;
    if (row.balanceGbp <= 0.005) continue;
    if (row.paymentStatus === "pending_approval") continue;
    total += row.balanceGbp;
  }
  return Math.round(total * 100) / 100;
}
