import { formatUkDateTextLong, formatUkDateTime } from "@/lib/datetime/uk";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  deriveHirePaymentDisplayStatus,
  type HirePaymentDisplayOptions,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import { formatHireSettlementSignedAmount } from "@/lib/fleet/hire-settlement-balance-display";
import { formatGbp } from "@/lib/fleet/maintenance";

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function activeBalanceHeroBreakdown(rentOutstandingGbp: number, extrasOutstandingGbp: number): string | null {
  const parts: string[] = [];
  if (rentOutstandingGbp > 0.005) parts.push(`${formatGbp(rentOutstandingGbp)} rent`);
  if (extrasOutstandingGbp > 0.005) parts.push(`${formatGbp(extrasOutstandingGbp)} extra charges`);
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
}): { value: string; hint: string; paid: boolean; warn: boolean } {
  const { depositDueGbp, depositPaidGbp, depositOutstandingGbp } = input;
  if (depositDueGbp <= 0.005) {
    return { value: "None", hint: "No deposit on this hire", paid: true, warn: false };
  }
  if (depositOutstandingGbp <= 0.005) {
    return {
      value: "Paid",
      hint: `${formatGbp(depositPaidGbp)} received · ${formatGbp(0)} outstanding`,
      paid: true,
      warn: false,
    };
  }
  return {
    value: formatGbp(depositOutstandingGbp),
    hint: `${formatGbp(depositPaidGbp)} received · ${formatGbp(depositOutstandingGbp)} outstanding`,
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
    { label: "Scheduled rent to date", value: formatGbp(input.scheduledRentGbp) },
    {
      label: "Discount applied",
      value: input.discountGbp > 0.005 ? `−${formatGbp(input.discountGbp)}` : formatGbp(0),
    },
    {
      label: "Rent paid",
      value: input.rentPaidGbp > 0.005 ? `−${formatGbp(input.rentPaidGbp)}` : formatGbp(0),
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
  return roundGbp(Math.max(0, rentOutstandingGbp) + Math.max(0, extrasOutstandingGbp));
}

function addDaysYmd(ymd: string, days: number): string {
  const parsed = Date.parse(`${ymd}T12:00:00`);
  if (!Number.isFinite(parsed)) return ymd;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
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

export function splitBalanceRentScheduleRows(
  rows: readonly HirePaymentPageRow[],
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
  lookaheadDays = 7,
): { primaryRows: HirePaymentPageRow[]; futureRows: HirePaymentPageRow[] } {
  const sorted = [...rows].sort((a, b) => {
    if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
    return a.sortOrder - b.sortOrder;
  });
  const lookaheadEndYmd = addDaysYmd(todayYmd, lookaheadDays);
  const primaryRows: HirePaymentPageRow[] = [];
  const futureRows: HirePaymentPageRow[] = [];

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
    const withinLookahead = row.periodStart <= lookaheadEndYmd;

    if (row.accrued || hasActivity || withinLookahead || status !== "upcoming") {
      primaryRows.push(row);
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
