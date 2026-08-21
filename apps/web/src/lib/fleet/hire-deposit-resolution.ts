import {
  netSettlementAfterDeposit,
  resolveSettlementBalanceDirection,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import {
  remainingOpenBalanceGbp,
  settlementCacheFromSignedGbp,
  signedSettlementBalanceGbp,
} from "@/lib/fleet/hire-open-balance";
import {
  resolveTerminationBalanceState,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import { roundGbp } from "@/lib/fleet/hire-money";

/**
 * Apply a deposit disposition to the current signed settlement position.
 * Used when staff resolves a deposit held pending review after contract end.
 */
export function computeDepositResolutionSettlement(input: {
  currentSignedSettlementGbp: number;
  depositGbp: number;
  disposition: HireDepositDisposition;
  refundAmountGbp?: number | null;
}): number {
  const balance = roundGbp(input.currentSignedSettlementGbp);
  const deposit = roundGbp(input.depositGbp);
  if (deposit <= 0 || input.disposition === "hold_pending") return balance;

  if (input.disposition === "forfeit") {
    if (balance > 0) return roundGbp(Math.max(0, balance - deposit));
    return balance;
  }

  if (input.disposition === "apply_to_balance" || input.disposition === "refund_full") {
    return roundGbp(balance - deposit);
  }

  if (input.disposition === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, input.refundAmountGbp ?? 0));
    return roundGbp(balance - refund);
  }

  return balance;
}

/** Preview settlement fields after resolving a held deposit. */
export function computeSettlementAfterDepositResolution(input: {
  currentSignedSettlementGbp: number;
  depositGbp: number;
  disposition: HireDepositDisposition;
  refundAmountGbp?: number | null;
  resolution: HireSettlementResolution;
}): {
  netSettlementGbp: number;
  settlementBalanceGbp: number;
  settlementBalanceDirection: ReturnType<typeof resolveSettlementBalanceDirection>;
  settlementDiscountGbp: number | null;
  recordPayment: { amountGbp: number; direction: "received_from_driver" | "paid_to_driver" } | null;
  openBalanceGbp: number;
} {
  const netSettlementGbp = computeDepositResolutionSettlement({
    currentSignedSettlementGbp: input.currentSignedSettlementGbp,
    depositGbp: input.depositGbp,
    disposition: input.disposition,
    refundAmountGbp: input.refundAmountGbp,
  });

  const balanceState = resolveTerminationBalanceState({
    netSettlementGbp,
    resolution: input.resolution,
  });

  const signed = signedSettlementBalanceGbp(
    balanceState.settlementBalanceDirection,
    balanceState.settlementBalanceGbp,
  );
  const remaining = remainingOpenBalanceGbp(signed, []);
  const cache = settlementCacheFromSignedGbp(remaining);

  return {
    netSettlementGbp: roundGbp(netSettlementGbp),
    settlementBalanceGbp: cache.settlementBalanceGbp,
    settlementBalanceDirection: cache.settlementBalanceDirection,
    settlementDiscountGbp: balanceState.settlementDiscountGbp,
    recordPayment: balanceState.recordPayment,
    openBalanceGbp: cache.settlementBalanceGbp,
  };
}

/** @deprecated Use computeDepositResolutionSettlement for post-termination deposit resolution. */
export function computeTerminationNetAfterDeposit(input: {
  terminationSummary: Pick<HireTerminationAccountsSummary, "signedRentBalanceGbp" | "depositGbp">;
  disposition: HireDepositDisposition;
  refundAmountGbp?: number | null;
}): number {
  return netSettlementAfterDeposit({
    balanceGbp: input.terminationSummary.signedRentBalanceGbp,
    depositGbp: input.terminationSummary.depositGbp,
    disposition: input.disposition,
    refundAmountGbp: input.refundAmountGbp,
  });
}

export function isDepositDispositionPending(disposition: string | null | undefined): boolean {
  return disposition === "hold_pending";
}

export function parseTerminationAccountsSummary(
  raw: unknown,
): HireTerminationAccountsSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const summary = raw as Partial<HireTerminationAccountsSummary>;
  if (typeof summary.signedRentBalanceGbp !== "number" || typeof summary.depositGbp !== "number") {
    return null;
  }
  const extrasRaw = Number(summary.outstandingExtraChargesGbp ?? 0);
  const discountRaw = Number(summary.totalDiscountGbp ?? 0);
  const grossRaw = Number(summary.rentGrossAccruedGbp ?? 0);
  const accruedDue = Number(summary.accruedRentDueGbp ?? 0);
  const safeDiscount =
    Number.isFinite(discountRaw) && discountRaw > 0.005 ? Math.round(discountRaw * 100) / 100 : 0;
  const safeGross =
    Number.isFinite(grossRaw) && grossRaw > 0.005
      ? Math.round(grossRaw * 100) / 100
      : Math.round((Math.max(0, accruedDue) + safeDiscount) * 100) / 100;
  return {
    ...(summary as HireTerminationAccountsSummary),
    outstandingExtraChargesGbp:
      Number.isFinite(extrasRaw) && extrasRaw > 0.005 ? Math.round(extrasRaw * 100) / 100 : 0,
    totalDiscountGbp: safeDiscount,
    rentGrossAccruedGbp: safeGross,
  };
}

export function depositResolutionHelpText(): string {
  return "The deposit was held when the contract ended. Choose whether to return it, keep it, or use it to pay rent. This updates the money owed on this hire.";
}
