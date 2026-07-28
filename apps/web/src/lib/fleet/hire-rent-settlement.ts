import {
  enrichHirePaymentRows,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import type { RentCadence } from "@/lib/fleet/hire-types";
import {
  buildTerminationBillingPeriodBreakdown,
  terminationRentDueForRow,
  type HireTerminationBillingPeriodBreakdown,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";

export type HireRentSettlementSummary = {
  accruedRentDueGbp: number;
  accruedRentPaidGbp: number;
  prepaidRentCreditGbp: number;
  /** Overpayment on accrued rent periods only (paid above accrued due). */
  accruedOverpaymentGbp: number;
  /** Positive = driver owes for rent; negative = company owes driver (credit). */
  signedRentSettlementGbp: number;
  billingMode: HireTerminationRentBillingMode;
  billingPeriodBreakdown: HireTerminationBillingPeriodBreakdown | null;
};

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rent-only settlement for contract end.
 * Includes accrued arrears/overpayment and prepaid future rent as driver credit.
 */
export function summarizeHireRentSettlement(
  rows: HirePaymentScheduleRowInput[],
  terminatedYmd: string,
  options?: {
    billingMode?: HireTerminationRentBillingMode;
    rentCadence?: RentCadence;
  },
): HireRentSettlementSummary {
  const billingMode = options?.billingMode ?? "end_of_period";
  const rentCadence = options?.rentCadence ?? "weekly";
  const enriched = enrichHirePaymentRows(rows, terminatedYmd);
  let accruedRentDueGbp = 0;
  let accruedRentPaidGbp = 0;
  let prepaidRentCreditGbp = 0;

  for (const row of enriched) {
    if (row.rowKind !== "rent") continue;
    if (row.periodStart > terminatedYmd) {
      prepaidRentCreditGbp += row.paidGbp;
      continue;
    }
    accruedRentDueGbp += terminationRentDueForRow(row, terminatedYmd, billingMode, rentCadence);
    accruedRentPaidGbp += row.paidGbp;
  }

  accruedRentDueGbp = roundGbp(accruedRentDueGbp);
  accruedRentPaidGbp = roundGbp(accruedRentPaidGbp);
  prepaidRentCreditGbp = roundGbp(prepaidRentCreditGbp);
  const accruedOverpaymentGbp = roundGbp(Math.max(0, accruedRentPaidGbp - accruedRentDueGbp));
  const signedRentSettlementGbp = roundGbp(
    accruedRentDueGbp - accruedRentPaidGbp - prepaidRentCreditGbp,
  );

  return {
    accruedRentDueGbp,
    accruedRentPaidGbp,
    prepaidRentCreditGbp,
    accruedOverpaymentGbp,
    signedRentSettlementGbp,
    billingMode,
    billingPeriodBreakdown: buildTerminationBillingPeriodBreakdown(
      enriched,
      terminatedYmd,
      rentCadence,
    ),
  };
}

export function requiresDepositDispositionReason(disposition: string): boolean {
  return (
    disposition === "apply_to_balance" ||
    disposition === "forfeit" ||
    disposition === "hold_pending" ||
    disposition === "refund_partial"
  );
}

export function depositDispositionReasonLabel(disposition: string): string {
  if (disposition === "refund_partial") return "Reason for partial refund";
  return "Reason deposit is not refunded in full";
}
