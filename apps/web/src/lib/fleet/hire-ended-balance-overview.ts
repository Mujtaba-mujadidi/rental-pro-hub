import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";
import {
  countHireEndedPendingReviews,
  type HireEndedPendingReviewsSummary,
} from "@/lib/fleet/hire-ended-balance-case";
import { buildHireEndedRentCalculation } from "@/lib/fleet/hire-ended-payments-display";
import { sumDriverChargesGbp } from "@/lib/fleet/hire-ended-summary-display";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";

export type HireEndedConfirmedCalcRow = {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "pending" | "emphasis";
};

export type HireEndedConfirmedCalculation = {
  rows: HireEndedConfirmedCalcRow[];
  confirmedBalanceLabel: string;
  confirmedBalanceGbp: number;
  pendingReviewGbp: number;
  projectedBalanceGbp: number | null;
  projectedLine: string | null;
};

/** Sum of proposed amounts on pending charge reviews (excludes deposit hold). */
export function sumHireEndedPendingChargeProposedGbp(
  summary: HireEndedPendingReviewsSummary | null | undefined,
): number {
  if (!summary) return 0;
  return roundGbp(
    summary.charges.reduce((sum, charge) => {
      const amount = Number(charge.proposedGbp);
      if (!Number.isFinite(amount) || amount <= 0) return sum;
      return sum + amount;
    }, 0),
  );
}

export function hireEndedPendingReviewBannerLine(input: {
  pendingReviews: HireEndedPendingReviewsSummary | null | undefined;
  openBalanceGbp: number;
}): string | null {
  const pendingCount = countHireEndedPendingReviews(input.pendingReviews);
  if (pendingCount <= 0) return null;
  const pendingGbp = sumHireEndedPendingChargeProposedGbp(input.pendingReviews);
  const open = roundGbp(Math.max(0, input.openBalanceGbp));
  const projected = roundGbp(open + pendingGbp);
  if (pendingGbp > 0.005) {
    return `${formatGbp(pendingGbp)} awaiting review · projected ${formatGbp(projected)}`;
  }
  if (input.pendingReviews?.depositPending) {
    const held = roundGbp(Math.max(0, input.pendingReviews.depositHeldGbp));
    return held > 0.005
      ? `Deposit ${formatGbp(held)} awaiting review`
      : "Deposit awaiting review";
  }
  return "Review required before final settlement";
}

export function buildHireEndedConfirmedCalculation(
  data: Pick<
    HirePaymentsPageData,
    | "terminationSummary"
    | "summary"
    | "depositDisposition"
    | "depositReceivedGbp"
    | "driverChargeLineItems"
    | "settlementBalance"
    | "settlementBalancePayments"
    | "pendingReviews"
    | "currentSignedSettlementGbp"
  >,
): HireEndedConfirmedCalculation {
  const rent = buildHireEndedRentCalculation(data);
  const postedChargesGbp = sumDriverChargesGbp(data.driverChargeLineItems);
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const openBalanceGbp = roundGbp(
    data.settlementBalance?.openBalanceGbp ?? Math.abs(data.currentSignedSettlementGbp),
  );
  const pendingReviewGbp = sumHireEndedPendingChargeProposedGbp(data.pendingReviews);
  const settlementFundingGbp = roundGbp(ledger.totalReceivedGbp);
  const settlementPaidGbp = roundGbp(ledger.totalPaidGbp);

  const rows: HireEndedConfirmedCalcRow[] = [
    {
      id: "rent",
      label: "Rent due to end date",
      value: formatGbp(rent.rentDueToEndGbp),
    },
    {
      id: "charges",
      label: "Posted charges",
      value: formatGbp(postedChargesGbp),
    },
  ];

  if (pendingReviewGbp > 0.005 || countHireEndedPendingReviews(data.pendingReviews) > 0) {
    rows.push({
      id: "pending",
      label: "Pending review",
      value: pendingReviewGbp > 0.005 ? formatGbp(pendingReviewGbp) : "Awaiting decision",
      tone: "pending",
    });
  }

  if (settlementFundingGbp > 0.005) {
    rows.push({
      id: "funding",
      label: "Settlement received",
      value: `−${formatGbp(settlementFundingGbp)}`,
    });
  }
  if (settlementPaidGbp > 0.005) {
    rows.push({
      id: "paid_out",
      label: "Paid to driver",
      value: formatGbp(settlementPaidGbp),
    });
  }

  rows.push({
    id: "confirmed",
    label: "Confirmed balance",
    value: formatGbp(openBalanceGbp),
    tone: "emphasis",
  });

  const projectedBalanceGbp =
    pendingReviewGbp > 0.005 ? roundGbp(openBalanceGbp + pendingReviewGbp) : null;

  return {
    rows,
    confirmedBalanceLabel: formatGbp(openBalanceGbp),
    confirmedBalanceGbp: openBalanceGbp,
    pendingReviewGbp,
    projectedBalanceGbp,
    projectedLine:
      projectedBalanceGbp != null
        ? `Projected after reviews ${formatGbp(projectedBalanceGbp)}`
        : null,
  };
}

export type HireEndedSettledKpis = {
  finalChargesGbp: number;
  receivedGbp: number;
  depositUsedGbp: number;
  refundedGbp: number;
};

export function buildHireEndedSettledKpis(
  data: Pick<
    HirePaymentsPageData,
    | "driverChargeLineItems"
    | "settlementBalancePayments"
    | "terminationSummary"
    | "depositDisposition"
    | "depositReceivedGbp"
    | "summary"
  >,
): HireEndedSettledKpis {
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const rent = buildHireEndedRentCalculation(data);
  return {
    finalChargesGbp: roundGbp(sumDriverChargesGbp(data.driverChargeLineItems) + rent.rentDueToEndGbp),
    receivedGbp: roundGbp(data.summary.totalPaidGbp + ledger.totalReceivedGbp),
    depositUsedGbp: rent.paidFromDepositGbp,
    refundedGbp: ledger.totalPaidGbp,
  };
}
