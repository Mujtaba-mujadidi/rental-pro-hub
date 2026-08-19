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
  extraChargesOutstandingGbp: number;
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
  includeDeposit: boolean;
  summary: Pick<HireDashboardData["summary"], "totalDueGbp" | "balanceGbp" | "totalPaidGbp">;
  paymentRows: readonly Pick<HirePaymentPageRow, "rowKind" | "balanceGbp" | "netDueGbp">[];
  extraChargesOutstandingGbp?: number;
  audience?: "staff" | "driver";
}): ActiveHirePaymentPosition {
  const { summary, paymentRows, audience = "staff" } = input;
  const includeDeposit =
    audience === "driver"
      ? input.includeDeposit || paymentRows.some((row) => row.rowKind === "deposit")
      : input.includeDeposit;
  const depositRow = depositRowFromPayments(paymentRows);
  const depositOutstandingGbp =
    includeDeposit && depositRow && depositRow.balanceGbp > 0.005
      ? roundGbp(depositRow.balanceGbp)
      : 0;
  const rentDueToDateGbp = roundGbp(summary.totalDueGbp);
  const rentOutstandingGbp = roundGbp(summary.balanceGbp);
  const rentPaidGbp = roundGbp(summary.totalPaidGbp);
  const extraChargesOutstandingGbp = roundGbp(Math.max(0, input.extraChargesOutstandingGbp ?? 0));
  const currentlyDueGbp = roundGbp(
    depositOutstandingGbp + rentOutstandingGbp + extraChargesOutstandingGbp,
  );

  const parts: string[] = [];
  if (depositOutstandingGbp > 0.005) parts.push(`${formatGbp(depositOutstandingGbp)} deposit`);
  if (rentOutstandingGbp > 0.005) parts.push(`${formatGbp(rentOutstandingGbp)} rent`);
  if (extraChargesOutstandingGbp > 0.005) {
    parts.push(`${formatGbp(extraChargesOutstandingGbp)} extra charges`);
  }

  let dueBreakdownLabel: string | null = null;
  if (parts.length >= 2) {
    dueBreakdownLabel =
      audience === "driver"
        ? `Includes ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}.`
        : `${parts.slice(0, -1).join(" plus ")} plus ${parts.at(-1)} outstanding.`;
  } else if (depositOutstandingGbp > 0.005) {
    dueBreakdownLabel =
      audience === "driver"
        ? `${formatGbp(depositOutstandingGbp)} deposit is still due before or at vehicle handover.`
        : `${formatGbp(depositOutstandingGbp)} deposit outstanding before or at vehicle handover.`;
  } else if (rentOutstandingGbp > 0.005) {
    dueBreakdownLabel =
      audience === "driver"
        ? `${formatGbp(rentOutstandingGbp)} rent is outstanding on accrued periods.`
        : `${formatGbp(rentOutstandingGbp)} rent outstanding on accrued periods.`;
  } else if (extraChargesOutstandingGbp > 0.005) {
    dueBreakdownLabel =
      audience === "driver"
        ? `${formatGbp(extraChargesOutstandingGbp)} in extra charges is still due.`
        : `${formatGbp(extraChargesOutstandingGbp)} extra charges outstanding.`;
  }

  return {
    depositOutstandingGbp,
    rentDueToDateGbp,
    rentOutstandingGbp,
    rentPaidGbp,
    extraChargesOutstandingGbp,
    currentlyDueGbp,
    dueBreakdownLabel,
  };
}

export function formatAmountDueChip(currentlyDueGbp: number): string | null {
  if (currentlyDueGbp <= 0.005) return null;
  return `${formatGbp(currentlyDueGbp)} due today`;
}

const STAFF_PAYMENT_RATING_LABEL: Record<HirePaymentHealthLevel, string> = {
  on_track: "On track",
  attention: "Needs attention",
  at_risk: "Overdue",
};

const DRIVER_PAYMENT_RATING_LABEL: Record<HirePaymentHealthLevel, string> = {
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
  audience?: "staff" | "driver";
}): ActiveHirePaymentRatingDisplay {
  const { health, position, attentionItems, includeDeposit, audience = "staff" } = input;
  const level = resolveActiveHirePaymentRatingLevel(health, position);
  const label =
    audience === "driver" ? DRIVER_PAYMENT_RATING_LABEL[level] : STAFF_PAYMENT_RATING_LABEL[level];

  const unpaidParts: string[] = [];
  if (position.depositOutstandingGbp > 0.005) {
    unpaidParts.push(
      audience === "driver"
        ? `the ${formatGbp(position.depositOutstandingGbp)} deposit`
        : `the ${formatGbp(position.depositOutstandingGbp)} deposit`,
    );
  }
  if (position.rentOutstandingGbp > 0.005) {
    unpaidParts.push(`${formatGbp(position.rentOutstandingGbp)} unpaid rent`);
  }
  if (position.extraChargesOutstandingGbp > 0.005) {
    unpaidParts.push(`${formatGbp(position.extraChargesOutstandingGbp)} extra charges`);
  }

  let detail: string;
  if (unpaidParts.length > 0) {
    detail =
      audience === "driver"
        ? `You still owe ${joinEnglishList(unpaidParts)}. Your score updates when payments are recorded on this hire.`
        : `No payment has been recorded for ${joinEnglishList(unpaidParts)}. The rating should update automatically when payments are recorded.`;
  } else if (level !== "on_track" && attentionItems[0]?.title) {
    detail =
      audience === "driver"
        ? `${attentionItems[0].title}. Your score updates when payments are recorded on this hire.`
        : `${attentionItems[0].title}. The rating should update automatically when payments are recorded.`;
  } else if (level === "on_track") {
    detail =
      audience === "driver"
        ? "Your recorded payments are up to date for this hire."
        : "Recorded payments are up to date for this hire.";
  } else {
    detail =
      audience === "driver"
        ? `${health.detail} Your score updates when payments are recorded on this hire.`
        : `${health.detail}. The rating should update automatically when payments are recorded.`;
  }

  const scorePercent =
    health.onTimePercent ??
    (position.rentDueToDateGbp > 0.005 && position.rentPaidGbp <= 0.005 ? 0 : null);

  const depositDue = position.depositOutstandingGbp > 0.005;
  const tracksDeposit = includeDeposit || depositDue;
  const totalDueItems = (tracksDeposit ? 1 : 0) + (position.rentDueToDateGbp > 0.005 ? 1 : 0);
  const outstandingItems =
    (depositDue ? 1 : 0) + (position.rentOutstandingGbp > 0.005 ? 1 : 0);
  const paidItems = Math.max(0, totalDueItems - outstandingItems);
  const scoreHint =
    totalDueItems > 0 && position.currentlyDueGbp > 0.005
      ? audience === "driver"
        ? `${formatGbp(position.currentlyDueGbp)} currently due · ${paidItems} of ${totalDueItems} due items paid`
        : `${formatGbp(position.currentlyDueGbp)} currently due · ${paidItems} of ${totalDueItems} due items paid`
      : null;

  return { level, label, detail, scorePercent, scoreHint };
}
