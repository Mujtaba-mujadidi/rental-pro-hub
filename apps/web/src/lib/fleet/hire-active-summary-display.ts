import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import type {
  HirePaymentAttentionItem,
  HirePaymentHealthLevel,
  HirePaymentHealthSummary,
} from "@/lib/fleet/hire-payment-analytics";
import { formatGbp } from "@/lib/fleet/maintenance";

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ActiveHirePaymentPosition = {
  depositOutstandingGbp: number;
  rentDueToDateGbp: number;
  rentOutstandingGbp: number;
  rentPaidGbp: number;
  currentlyDueGbp: number;
  dueBreakdownLabel: string | null;
};

export function depositRowFromPayments(
  rows: readonly Pick<HirePaymentPageRow, "rowKind" | "balanceGbp" | "netDueGbp">[],
): Pick<HirePaymentPageRow, "balanceGbp" | "netDueGbp"> | null {
  const row = rows.find((item) => item.rowKind === "deposit");
  return row ?? null;
}

/** Payment position for active-hire summary cards — uses existing schedule/summary fields only. */
export function buildActiveHirePaymentPosition(input: {
  dashboard: HireDashboardData;
  paymentRows: readonly Pick<HirePaymentPageRow, "rowKind" | "balanceGbp" | "netDueGbp">[];
}): ActiveHirePaymentPosition {
  const { dashboard, paymentRows } = input;
  const depositRow = depositRowFromPayments(paymentRows);
  const depositOutstandingGbp =
    dashboard.includeDeposit && depositRow && depositRow.balanceGbp > 0.005
      ? roundGbp(depositRow.balanceGbp)
      : 0;
  const rentDueToDateGbp = roundGbp(dashboard.summary.totalDueGbp);
  const rentOutstandingGbp = roundGbp(dashboard.summary.balanceGbp);
  const rentPaidGbp = roundGbp(dashboard.summary.totalPaidGbp);
  const currentlyDueGbp = roundGbp(depositOutstandingGbp + rentOutstandingGbp);

  let dueBreakdownLabel: string | null = null;
  if (depositOutstandingGbp > 0.005 && rentOutstandingGbp > 0.005) {
    dueBreakdownLabel = `${formatGbp(depositOutstandingGbp)} deposit plus ${formatGbp(rentOutstandingGbp)} rent outstanding.`;
  } else if (depositOutstandingGbp > 0.005) {
    dueBreakdownLabel = `${formatGbp(depositOutstandingGbp)} deposit outstanding before or at vehicle handover.`;
  } else if (rentOutstandingGbp > 0.005) {
    dueBreakdownLabel = `${formatGbp(rentOutstandingGbp)} rent outstanding on accrued periods.`;
  }

  return {
    depositOutstandingGbp,
    rentDueToDateGbp,
    rentOutstandingGbp,
    rentPaidGbp,
    currentlyDueGbp,
    dueBreakdownLabel,
  };
}

export function formatAmountDueChip(currentlyDueGbp: number): string | null {
  if (currentlyDueGbp <= 0.005) return null;
  return `${formatGbp(currentlyDueGbp)} due today`;
}

const PAYMENT_RATING_LABEL: Record<HirePaymentHealthLevel, string> = {
  on_track: "On track",
  attention: "Needs attention",
  at_risk: "Overdue",
};

function joinEnglishList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, or ${parts.at(-1)}`;
}

/** Elevate rating when money is still outstanding even if no period is overdue yet. */
export function resolveActiveHirePaymentRatingLevel(
  health: HirePaymentHealthSummary,
  position: ActiveHirePaymentPosition,
): HirePaymentHealthLevel {
  if (health.level === "at_risk") return "at_risk";
  if (position.currentlyDueGbp > 0.005 || health.level === "attention") return "attention";
  return "on_track";
}

export type ActiveHirePaymentRatingDisplay = {
  level: HirePaymentHealthLevel;
  label: string;
  detail: string;
  scorePercent: number | null;
  scoreHint: string | null;
};

export function buildActiveHirePaymentRatingDisplay(input: {
  health: HirePaymentHealthSummary;
  position: ActiveHirePaymentPosition;
  attentionItems: readonly Pick<HirePaymentAttentionItem, "kind" | "title" | "amountGbp">[];
  includeDeposit: boolean;
}): ActiveHirePaymentRatingDisplay {
  const { health, position, attentionItems, includeDeposit } = input;
  const level = resolveActiveHirePaymentRatingLevel(health, position);
  const label = PAYMENT_RATING_LABEL[level];

  const unpaidParts: string[] = [];
  if (position.depositOutstandingGbp > 0.005) {
    unpaidParts.push(`the ${formatGbp(position.depositOutstandingGbp)} deposit`);
  }
  if (position.rentOutstandingGbp > 0.005) {
    const dueToday = attentionItems.some((item) => item.kind === "due");
    unpaidParts.push(
      dueToday
        ? `today's ${formatGbp(position.rentOutstandingGbp)} rent`
        : `${formatGbp(position.rentOutstandingGbp)} outstanding rent`,
    );
  }

  let detail: string;
  if (unpaidParts.length > 0) {
    detail = `No payment has been recorded for ${joinEnglishList(unpaidParts)}. The rating should update automatically when payments are recorded.`;
  } else if (level !== "on_track" && attentionItems[0]?.title) {
    detail = `${attentionItems[0].title}. The rating should update automatically when payments are recorded.`;
  } else if (level === "on_track") {
    detail = "Recorded payments are up to date for this hire.";
  } else {
    detail = `${health.detail}. The rating should update automatically when payments are recorded.`;
  }

  const scorePercent =
    health.onTimePercent ??
    (position.rentDueToDateGbp > 0.005 && position.rentPaidGbp <= 0.005 ? 0 : null);

  const totalDueItems =
    (includeDeposit ? 1 : 0) + (position.rentDueToDateGbp > 0.005 ? 1 : 0);
  const outstandingItems =
    (position.depositOutstandingGbp > 0.005 ? 1 : 0) + (position.rentOutstandingGbp > 0.005 ? 1 : 0);
  const paidItems = Math.max(0, totalDueItems - outstandingItems);
  const scoreHint =
    totalDueItems > 0 && position.currentlyDueGbp > 0.005
      ? `${formatGbp(position.currentlyDueGbp)} currently due · ${paidItems} of ${totalDueItems} due items paid`
      : null;

  return { level, label, detail, scorePercent, scoreHint };
}
