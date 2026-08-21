import { formatUkDateTextLong, formatUkDateTime } from "@/lib/datetime/uk";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { buildHireAccountPosition } from "@/lib/fleet/hire-account-position";
import {
  deriveHirePaymentDisplayStatus,
  type HirePaymentDisplayOptions,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import { formatHireSettlementSignedAmount } from "@/lib/fleet/hire-settlement-balance-display";
import { formatGbp } from "@/lib/fleet/maintenance";

export function activeBalanceHeroBreakdown(input: {
  depositOutstandingGbp: number;
  rentOutstandingGbp: number;
  extrasOutstandingGbp: number;
}): string | null {
  const parts: string[] = [];
  if (input.depositOutstandingGbp > 0.005) {
    parts.push(`${formatGbp(input.depositOutstandingGbp)} deposit`);
  }
  if (input.rentOutstandingGbp > 0.005) {
    parts.push(`${formatGbp(input.rentOutstandingGbp)} rent`);
  }
  if (input.extrasOutstandingGbp > 0.005) {
    parts.push(`${formatGbp(input.extrasOutstandingGbp)} extra charges`);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(" + ")} + ${parts.at(-1)}`;
}

export function activeBalanceChargedPaidHint(chargedGbp: number, paidGbp: number): string {
  return `${formatGbp(chargedGbp)} charged · ${formatGbp(paidGbp)} paid`;
}

export function activeBalanceDepositCardDisplay(input: {
  depositDueGbp: number;
  depositPaidGbp: number;
  depositOutstandingGbp: number;
}): { label: string; value: string; hint: string; paid: boolean; warn: boolean } {
  const { depositDueGbp, depositPaidGbp, depositOutstandingGbp } = input;
  if (depositDueGbp <= 0.005) {
    return {
      label: "Deposit required",
      value: "None",
      hint: "No deposit on this hire",
      paid: true,
      warn: false,
    };
  }
  if (depositOutstandingGbp <= 0.005) {
    return {
      label: "Deposit required",
      value: formatGbp(depositDueGbp),
      hint: `${formatGbp(depositPaidGbp)} actually received · ${formatGbp(0)} outstanding`,
      paid: true,
      warn: false,
    };
  }
  return {
    label: "Deposit required",
    value: formatGbp(depositDueGbp),
    hint: `${formatGbp(depositPaidGbp)} actually received · ${formatGbp(depositOutstandingGbp)} outstanding`,
    paid: false,
    warn: true,
  };
}

export function activeBalanceNextRentDueHint(periodStart: string): string {
  return `Due ${formatUkDateTextLong(periodStart)}`;
}

export function activeBalanceFeaturedChargeMeta(input: {
  createdAt: string;
  hasEvidence: boolean;
}): string {
  const recorded = `Recorded ${formatUkDateTime(input.createdAt)}`;
  if (input.hasEvidence) return `${recorded} · Photographic evidence attached`;
  return recorded;
}

export function selectFeaturedOutstandingExtraCharge<
  T extends { id: string; balanceGbp: number; createdAt?: string | null },
>(rows: readonly T[]): T | null {
  const outstanding = rows.filter((row) => row.balanceGbp > 0.005);
  if (!outstanding.length) return null;
  return [...outstanding].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
}

export function activeBalanceRentAccountRows(input: {
  scheduledRentGbp: number;
  discountGbp: number;
  rentPaidGbp: number;
  rentOutstandingGbp: number;
}): Array<{ label: string; value: string; strong?: boolean }> {
  return [
    { label: "Rent charged to date", value: formatGbp(input.scheduledRentGbp) },
    {
      label: "Discount applied",
      value: input.discountGbp > 0.005 ? `−${formatGbp(input.discountGbp)}` : `−${formatGbp(0)}`,
    },
    {
      label: "Rent received",
      value: input.rentPaidGbp > 0.005 ? `−${formatGbp(input.rentPaidGbp)}` : `−${formatGbp(0)}`,
    },
    {
      label: "Outstanding rent",
      value: formatGbp(Math.max(0, input.rentOutstandingGbp)),
      strong: true,
    },
  ];
}

export function activeBalanceHeaderPeriod(startedAt: string | null): string {
  const startYmd = startedAt?.slice(0, 10) || null;
  if (!startYmd) return "Ongoing";
  return `${formatUkDateTextLong(startYmd)} — ongoing`;
}

export function activeBalanceHeaderRentLine(
  amountGbp: number | null | undefined,
  cadence: string | null | undefined,
): string | null {
  if (amountGbp == null || !Number.isFinite(amountGbp)) return null;
  const normalized = String(cadence ?? "").trim();
  if (normalized === "daily") return `${formatGbp(amountGbp)} daily rent`;
  if (normalized === "weekly") return `${formatGbp(amountGbp)} weekly rent`;
  if (normalized === "monthly") return `${formatGbp(amountGbp)} monthly rent`;
  return `${formatGbp(amountGbp)} rent`;
}

export function activeBalanceOpenAmountGbp(
  rentOutstandingGbp: number,
  extrasOutstandingGbp: number,
): number {
  return buildHireAccountPosition({
    lifecycle: "active",
    depositRequiredGbp: 0,
    depositReceivedGbp: 0,
    rentGrossChargedGbp: Math.max(0, rentOutstandingGbp),
    rentDiscountGbp: 0,
    rentPaidConfirmedGbp: 0,
    extraChargesPostedGbp: Math.max(0, extrasOutstandingGbp),
    extraChargePaymentsConfirmedGbp: 0,
  }).amountDriverOwesCompanyGbp;
}

export function balanceRentScheduleCadenceKicker(cadence: string | null | undefined): string {
  const normalized = String(cadence ?? "").trim();
  if (normalized === "daily") return "Daily rent";
  if (normalized === "weekly") return "Weekly rent";
  if (normalized === "monthly") return "Monthly rent";
  return "Rent";
}

export function balanceRentSchedulePeriodLabel(
  row: Pick<HirePaymentPageRow, "rowKind" | "periodStart" | "periodEnd">,
): string {
  if (row.rowKind === "deposit") return "Deposit";
  if (row.periodStart === row.periodEnd) return formatUkDateTextLong(row.periodStart);
  return `${formatUkDateTextLong(row.periodStart)} – ${formatUkDateTextLong(row.periodEnd)}`;
}

export function balanceRentScheduleAdjustmentLabel(discountGbp: number): string {
  if (discountGbp <= 0.005) return "—";
  return `−${formatGbp(discountGbp)}`;
}

export function balanceRentScheduleBalanceTone(
  displayStatus: HirePaymentDisplayStatus,
  balanceGbp: number,
): "paid" | "due" | "upcoming" {
  if (balanceGbp <= 0.005) return "paid";
  if (displayStatus === "upcoming") return "upcoming";
  return "due";
}

/**
 * Primary table: deposit + all due/overdue/paid (non-upcoming) rent, plus up to
 * `upcomingLimit` upcoming periods. Remaining upcoming periods go in the future card.
 */
export function splitBalanceRentScheduleRows(
  rows: readonly HirePaymentPageRow[],
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
  upcomingLimit = 1,
): { primaryRows: HirePaymentPageRow[]; futureRows: HirePaymentPageRow[] } {
  const sorted = [...rows].sort((a, b) => {
    if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
    return a.sortOrder - b.sortOrder;
  });
  const primaryRows: HirePaymentPageRow[] = [];
  const futureRows: HirePaymentPageRow[] = [];
  let upcomingIncluded = 0;

  for (const row of sorted) {
    if (row.rowKind === "deposit") {
      primaryRows.push(row);
      continue;
    }

    const status = deriveHirePaymentDisplayStatus(row, todayYmd, options);
    const hasActivity =
      row.paidGbp > 0.005 ||
      row.discountTotalGbp > 0.005 ||
      row.paymentStatus !== "not_received" ||
      (row.pendingSubmittedGbp ?? 0) > 0.005;

    if (row.accrued || hasActivity || status !== "upcoming") {
      primaryRows.push(row);
      continue;
    }

    if (upcomingIncluded < upcomingLimit) {
      primaryRows.push(row);
      upcomingIncluded += 1;
      continue;
    }

    futureRows.push(row);
  }

  return { primaryRows, futureRows };
}

export function balanceRentScheduleFutureSummary(
  futureRows: readonly Pick<HirePaymentPageRow, "rowKind">[],
  cadence: string | null | undefined,
): string {
  const count = futureRows.filter((row) => row.rowKind === "rent").length;
  const normalized = String(cadence ?? "").trim();
  let periodLabel = count === 1 ? "rent period" : "rent periods";
  if (normalized === "daily") periodLabel = count === 1 ? "daily period" : "daily periods";
  if (normalized === "weekly") periodLabel = count === 1 ? "weekly period" : "weekly periods";
  if (normalized === "monthly") periodLabel = count === 1 ? "monthly period" : "monthly periods";
  return `${count} ${periodLabel} · future rent is not currently owed`;
}

export type ActiveBalanceStatementCalcRow = {
  label: string;
  value: string;
  strong?: boolean;
};

export function activeBalanceStatementCalculation(input: {
  rentChargedAfterDiscountGbp: number;
  extraChargesGbp: number;
  paymentsReceivedGbp: number;
  currentBalanceGbp: number;
}): { rows: ActiveBalanceStatementCalcRow[]; footnote: string } {
  const rows: ActiveBalanceStatementCalcRow[] = [
    {
      label: "Rent charged after discount",
      value: formatGbp(Math.max(0, input.rentChargedAfterDiscountGbp)),
    },
    {
      label: "Extra charges",
      value: formatHireSettlementSignedAmount(Math.max(0, input.extraChargesGbp)),
    },
    {
      label: "Payments received",
      value:
        input.paymentsReceivedGbp > 0.005
          ? formatHireSettlementSignedAmount(-Math.max(0, input.paymentsReceivedGbp))
          : formatGbp(0),
    },
    {
      label: "Current balance",
      value: formatGbp(Math.max(0, input.currentBalanceGbp)),
      strong: true,
    },
  ];
  return {
    rows,
    footnote: "Pending payments remain separate until a company user approves them.",
  };
}

export type HirePaymentApplyTo = "schedule" | "extra_charges";

/** When deposit is still owed, staff/driver choose deposit vs rent for schedule payments. */
export type HireSchedulePaymentTarget = "deposit" | "rent";

/** Default apply-to when both rent and extra charges can be paid from one composer. */
export function defaultHirePaymentApplyTo(input: {
  rentOutstandingGbp: number;
  extraOutstandingGbp: number;
  extraChargesSelectable: boolean;
  preferred?: HirePaymentApplyTo;
}): HirePaymentApplyTo {
  const rentOpen = input.rentOutstandingGbp > 0.005;
  const extrasOpen = input.extraChargesSelectable && input.extraOutstandingGbp > 0.005;
  if (input.preferred === "extra_charges" && extrasOpen) return "extra_charges";
  if (input.preferred === "schedule" && rentOpen) return "schedule";
  if (extrasOpen && !rentOpen) return "extra_charges";
  return "schedule";
}

export function defaultHireSchedulePaymentTarget(depositOutstandingGbp: number): HireSchedulePaymentTarget {
  return depositOutstandingGbp > 0.005 ? "deposit" : "rent";
}
