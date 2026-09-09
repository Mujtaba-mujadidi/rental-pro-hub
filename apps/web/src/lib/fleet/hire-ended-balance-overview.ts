import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { formatHireEndHireSignedAmount } from "@/lib/fleet/hire-end-hire-financial";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";
import {
  countHireEndedPendingReviews,
  hireEndedConfirmedPositionLabel,
  type HireEndedPendingReviewsSummary,
} from "@/lib/fleet/hire-ended-balance-case";
import {
  buildHireEndedRentCalculation,
} from "@/lib/fleet/hire-ended-payments-display";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";

export type HireEndedConfirmedCalcRow = {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "pending" | "emphasis";
};

export type HireEndedConfirmedCalculation = {
  chargeRows: HireEndedConfirmedCalcRow[];
  totalConfirmedChargesGbp: number;
  totalConfirmedChargesLabel: string;
  fundingRows: HireEndedConfirmedCalcRow[];
  fundingAppliedGbp: number;
  confirmedBalanceLabel: string;
  confirmedBalanceHeadline: string;
  confirmedBalanceGbp: number;
  pendingReviewGbp: number;
  projectedBalanceGbp: number | null;
  projectedLine: string | null;
  /** Shown under the confirmed balance when return items still need review. */
  pendingReviewNote: string | null;
  /** @deprecated flat rows kept for settled reconciliation */
  rows: HireEndedConfirmedCalcRow[];
};

/** Footnote for Overview when return charges await a decision (not listed line-by-line). */
export function hireEndedPendingChargeReviewNote(
  summary: HireEndedPendingReviewsSummary | null | undefined,
): string | null {
  const count = summary?.charges.length ?? 0;
  if (count <= 0) return null;
  if (count === 1) {
    return "One return item still needs review. The confirmed balance may change once that decision is made.";
  }
  return `${count} return items still need review. The confirmed balance may change once those decisions are made.`;
}

function isReturnChargeSource(sourceKind: string): boolean {
  return (
    sourceKind === "checkin_inspection_damage" ||
    sourceKind === "checkin_inspection_fuel" ||
    sourceKind === "checkin_inspection_accessory"
  );
}

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
    return `${formatGbp(pendingGbp)} awaiting review · projected balance if approved ${formatGbp(projected)}`;
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
    | "unpostedReturnCharges"
    | "settlementBalance"
    | "settlementBalancePayments"
    | "pendingReviews"
    | "currentSignedSettlementGbp"
  >,
): HireEndedConfirmedCalculation {
  const rent = buildHireEndedRentCalculation(data);
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const openBalanceGbp = roundGbp(
    data.settlementBalance?.openBalanceGbp ?? Math.abs(data.currentSignedSettlementGbp),
  );
  const pendingReviewGbp = sumHireEndedPendingChargeProposedGbp(data.pendingReviews);
  const direction =
    data.settlementBalance?.settlementDirection ??
    (openBalanceGbp <= 0.005 ? "settled" : "driver_owes_company");

  const posted = data.driverChargeLineItems.filter(
    (item) =>
      (item.resolution === "add_to_balance" || item.resolution === "paid_now") &&
      item.amountGbp > 0.005,
  );
  const existingExtrasGbp = roundGbp(
    posted
      .filter((item) => !isReturnChargeSource(item.sourceKind))
      .reduce((sum, item) => sum + item.amountGbp, 0),
  );
  const returnCharges = posted.filter((item) => isReturnChargeSource(item.sourceKind));
  const unpostedReturnCharges = data.unpostedReturnCharges ?? [];

  const returnChargesGbp = roundGbp(
    returnCharges.reduce((sum, item) => sum + item.amountGbp, 0) +
      unpostedReturnCharges.reduce((sum, item) => sum + item.amountGbp, 0),
  );

  const chargeRows: HireEndedConfirmedCalcRow[] = [
    {
      id: "rent",
      label: "Rent through return time",
      value: formatHireEndHireSignedAmount(rent.rentDueToEndGbp, true),
    },
  ];
  if (existingExtrasGbp > 0.005) {
    chargeRows.push({
      id: "existing-extras",
      label: "Existing posted extra charges",
      value: formatHireEndHireSignedAmount(existingExtrasGbp, true),
    });
  }
  if (returnChargesGbp > 0.005) {
    chargeRows.push({
      id: "return-charges",
      label: "Return charges",
      value: formatHireEndHireSignedAmount(returnChargesGbp, true),
    });
  }

  const totalConfirmedChargesGbp = roundGbp(
    rent.rentDueToEndGbp + existingExtrasGbp + returnChargesGbp,
  );

  const pendingReviewNote = hireEndedPendingChargeReviewNote(data.pendingReviews);

  const rentReceivedGbp = roundGbp(Math.max(0, rent.paymentReceivedDuringHireGbp));
  const extraReceiptsGbp = roundGbp(Math.max(0, ledger.driverChargeReceivedGbp));
  const settlementReceivedGbp = roundGbp(Math.max(0, ledger.settlementReceivedGbp));
  const fundingAppliedGbp = roundGbp(rentReceivedGbp + extraReceiptsGbp + settlementReceivedGbp);

  const fundingRows: HireEndedConfirmedCalcRow[] = [];
  if (rentReceivedGbp > 0.005) {
    fundingRows.push({
      id: "rent-received",
      label: "Rent received during hire",
      value: formatHireEndHireSignedAmount(rentReceivedGbp, false),
    });
  }
  if (extraReceiptsGbp > 0.005) {
    fundingRows.push({
      id: "extra-receipts",
      label: "Extra charge receipts",
      value: formatHireEndHireSignedAmount(extraReceiptsGbp, false),
    });
  }
  if (settlementReceivedGbp > 0.005) {
    fundingRows.push({
      id: "settlement-received",
      label: "Settlement received",
      value: formatHireEndHireSignedAmount(settlementReceivedGbp, false),
    });
  }

  const confirmedBalanceHeadline = hireEndedConfirmedPositionLabel({
    direction,
    amountGbp: openBalanceGbp,
  });

  const projectedBalanceGbp =
    pendingReviewGbp > 0.005 ? roundGbp(openBalanceGbp + pendingReviewGbp) : null;

  const flatRows: HireEndedConfirmedCalcRow[] = [
    ...chargeRows,
    {
      id: "total-charges",
      label: "Total confirmed charges",
      value: formatGbp(totalConfirmedChargesGbp),
      tone: "emphasis",
    },
    ...fundingRows,
    {
      id: "funding-applied",
      label: "Funding applied",
      value: formatGbp(fundingAppliedGbp),
      tone: "emphasis",
    },
    {
      id: "confirmed",
      label: "Confirmed balance now",
      value: confirmedBalanceHeadline,
      tone: "emphasis",
    },
  ];

  return {
    chargeRows,
    totalConfirmedChargesGbp,
    totalConfirmedChargesLabel: formatGbp(totalConfirmedChargesGbp),
    fundingRows,
    fundingAppliedGbp,
    confirmedBalanceLabel: formatGbp(openBalanceGbp),
    confirmedBalanceHeadline,
    confirmedBalanceGbp: openBalanceGbp,
    pendingReviewGbp,
    projectedBalanceGbp,
    projectedLine:
      projectedBalanceGbp != null
        ? `Projected if charge approved ${formatGbp(projectedBalanceGbp)}`
        : null,
    pendingReviewNote,
    rows: flatRows,
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
  > &
    Partial<Pick<HirePaymentsPageData, "depositAppliedToRentGbp" | "depositAppliedToChargesGbp">>,
): HireEndedSettledKpis {
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const rent = buildHireEndedRentCalculation(data);
  const postedChargesGbp = roundGbp(
    data.driverChargeLineItems
      .filter(
        (item) =>
          (item.resolution === "add_to_balance" || item.resolution === "paid_now") &&
          item.amountGbp > 0.005,
      )
      .reduce((sum, item) => sum + item.amountGbp, 0),
  );
  const persistedDepositUsed = roundGbp(
    Math.max(0, Number(data.depositAppliedToRentGbp ?? 0)) +
      Math.max(0, Number(data.depositAppliedToChargesGbp ?? 0)),
  );
  return {
    finalChargesGbp: roundGbp(postedChargesGbp + rent.rentDueToEndGbp),
    receivedGbp: roundGbp(data.summary.totalPaidGbp + ledger.totalReceivedGbp),
    depositUsedGbp: persistedDepositUsed > 0.005 ? persistedDepositUsed : rent.paidFromDepositGbp,
    refundedGbp: ledger.totalPaidGbp,
  };
}

export type HireEndedDepositPositionDisplay = {
  requiredGbp: number;
  receivedGbp: number;
  unreceivedGbp: number;
  confirmedBeforeDepositGbp: number;
  projectedIfApprovedGbp: number | null;
  heldSeparatelyGbp: number;
  appliedToRentGbp: number;
  appliedToChargesGbp: number;
  appliedTotalGbp: number;
  refundedGbp: number;
  stillOwesGbp: number;
  stillOwesLabel: string;
  heldForReview: boolean;
  holdReason: string | null;
  /** True when deposit disposition has been resolved (no longer held). */
  dispositionResolved: boolean;
};

export function buildHireEndedDepositPositionDisplay(
  data: Pick<
    HirePaymentsPageData,
    | "terminationSummary"
    | "depositReceivedGbp"
    | "depositPendingReview"
    | "pendingReviews"
    | "depositDisposition"
    | "settlementBalancePayments"
  > &
    Partial<Pick<HirePaymentsPageData, "depositAppliedToRentGbp" | "depositAppliedToChargesGbp">>,
  confirmed: Pick<HireEndedConfirmedCalculation, "confirmedBalanceGbp" | "projectedBalanceGbp">,
): HireEndedDepositPositionDisplay {
  const requiredGbp = roundGbp(Math.max(0, data.terminationSummary?.depositGbp ?? 0));
  const receivedGbp = roundGbp(Math.max(0, data.depositReceivedGbp));
  const unreceivedGbp = roundGbp(Math.max(0, requiredGbp - receivedGbp));
  const confirmedBeforeDepositGbp = confirmed.confirmedBalanceGbp;
  const heldForReview = data.depositPendingReview;
  const heldSeparatelyGbp = heldForReview
    ? roundGbp(Math.max(0, data.pendingReviews.depositHeldGbp || receivedGbp))
    : 0;
  const appliedToRentGbp = roundGbp(Math.max(0, Number(data.depositAppliedToRentGbp ?? 0)));
  const appliedToChargesGbp = roundGbp(Math.max(0, Number(data.depositAppliedToChargesGbp ?? 0)));
  const appliedTotalGbp = roundGbp(appliedToRentGbp + appliedToChargesGbp);
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const refundedGbp = heldForReview ? 0 : roundGbp(Math.max(0, ledger.settlementPaidGbp));
  const dispositionResolved =
    !heldForReview &&
    Boolean(data.depositDisposition) &&
    data.depositDisposition !== "hold_pending";

  return {
    requiredGbp,
    receivedGbp,
    unreceivedGbp,
    confirmedBeforeDepositGbp,
    projectedIfApprovedGbp: confirmed.projectedBalanceGbp,
    heldSeparatelyGbp,
    appliedToRentGbp,
    appliedToChargesGbp,
    appliedTotalGbp,
    refundedGbp,
    stillOwesGbp: confirmedBeforeDepositGbp,
    stillOwesLabel: formatGbp(confirmedBeforeDepositGbp),
    heldForReview,
    holdReason: null,
    dispositionResolved,
  };
}
