/** Signed settlement balance after balance-tracker payments. */

export type HireBalancePaymentInput = {
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
};

export function signedSettlementBalanceGbp(
  direction: "driver_owes_company" | "company_owes_driver" | "settled",
  amountGbp: number,
): number {
  const amount = Math.round(Math.abs(amountGbp) * 100) / 100;
  if (direction === "settled" || amount === 0) return 0;
  return direction === "driver_owes_company" ? amount : -amount;
}

export function remainingOpenBalanceGbp(
  signedBalanceGbp: number,
  payments: readonly HireBalancePaymentInput[],
): number {
  let remaining = signedBalanceGbp;
  for (const payment of payments) {
    const amount = Math.round(payment.amountGbp * 100) / 100;
    if (payment.direction === "received_from_driver") {
      remaining = Math.round((remaining - amount) * 100) / 100;
    } else {
      remaining = Math.round((remaining + amount) * 100) / 100;
    }
  }
  if (Math.abs(remaining) < 0.005) return 0;
  return remaining;
}

export function openBalanceDirection(
  signedBalanceGbp: number,
): "driver_owes_company" | "company_owes_driver" | "settled" {
  if (signedBalanceGbp > 0.005) return "driver_owes_company";
  if (signedBalanceGbp < -0.005) return "company_owes_driver";
  return "settled";
}
