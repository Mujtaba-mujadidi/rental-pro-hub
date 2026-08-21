/** Signed settlement balance after balance-tracker payments. */

import {
  addGbp,
  clampNonNegativeGbp,
  isZeroGbp,
  roundGbp,
} from "@/lib/fleet/hire-money";

export type HireBalancePaymentInput = {
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
};

export type HireSettlementBalanceCache = {
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  settlementBalanceGbp: number;
};

export function signedSettlementBalanceGbp(
  direction: "driver_owes_company" | "company_owes_driver" | "settled",
  amountGbp: number,
): number {
  const amount = clampNonNegativeGbp(roundGbp(Math.abs(amountGbp)));
  if (direction === "settled" || isZeroGbp(amount)) return 0;
  return direction === "driver_owes_company" ? amount : -amount;
}

export function remainingOpenBalanceGbp(
  signedBalanceGbp: number,
  payments: readonly HireBalancePaymentInput[],
): number {
  let remainingPence = Math.round(signedBalanceGbp * 100);
  for (const payment of payments) {
    const amountPence = Math.round(roundGbp(payment.amountGbp) * 100);
    if (payment.direction === "received_from_driver") {
      remainingPence -= amountPence;
    } else {
      remainingPence += amountPence;
    }
  }
  if (Math.abs(remainingPence) < 1) return 0;
  return remainingPence / 100;
}

export function openBalanceDirection(
  signedBalanceGbp: number,
): "driver_owes_company" | "company_owes_driver" | "settled" {
  if (signedBalanceGbp > 0.005) return "driver_owes_company";
  if (signedBalanceGbp < -0.005) return "company_owes_driver";
  return "settled";
}

/** Persistable hire-group settlement cache from a signed open amount. */
export function settlementCacheFromSignedGbp(signedGbp: number): HireSettlementBalanceCache {
  const direction = openBalanceDirection(signedGbp);
  if (direction === "settled") {
    return { settlementBalanceDirection: "settled", settlementBalanceGbp: 0 };
  }
  return {
    settlementBalanceDirection: direction,
    settlementBalanceGbp: clampNonNegativeGbp(roundGbp(Math.abs(signedGbp))),
  };
}

/**
 * Recompute the settlement cache after charge deltas and/or ledger payments.
 * Positive `extraChargesAddedGbp` increases what the driver owes.
 */
export function recomputeSettlementBalanceCache(input: {
  openingDirection: "driver_owes_company" | "company_owes_driver" | "settled" | null;
  openingBalanceGbp: number;
  extraChargesAddedGbp?: number;
  payments?: readonly HireBalancePaymentInput[];
}): HireSettlementBalanceCache & { signedGbp: number } {
  let signed = signedSettlementBalanceGbp(
    input.openingDirection ?? "settled",
    input.openingBalanceGbp,
  );
  const extras = roundGbp(input.extraChargesAddedGbp ?? 0);
  if (!isZeroGbp(extras)) {
    signed = addGbp(signed, extras);
  }
  if (input.payments?.length) {
    signed = remainingOpenBalanceGbp(signed, input.payments);
  }
  const cache = settlementCacheFromSignedGbp(signed);
  return { ...cache, signedGbp: signed };
}
