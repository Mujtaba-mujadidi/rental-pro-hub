import { roundGbp } from "@/lib/fleet/hire-money";
import { isDepositDispositionPending } from "@/lib/fleet/hire-deposit-resolution";

export const HIRE_DEPOSIT_APPLIED_TO_CHARGES_NOTE = "Deposit applied to balance";

/** Sum deposit rent credits persisted on schedule status events. */
export function sumDepositAppliedToRentFromStatusEvents(
  events: readonly { amendmentPayload?: unknown; amendment_payload?: unknown }[],
): number {
  let total = 0;
  for (const event of events) {
    const payload = (event.amendmentPayload ?? event.amendment_payload ?? null) as {
      depositAppliedGbp?: unknown;
    } | null;
    const amount = Number(payload?.depositAppliedGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

/** Sum deposit credits recorded against extra charges. */
export function sumDepositAppliedToChargesFromPayments(
  payments: readonly {
    amountGbp: number;
    direction?: string | null;
    paymentCategory?: string | null;
    notes?: string | null;
  }[],
): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.direction !== "received_from_driver") continue;
    if (String(payment.paymentCategory ?? "") !== "driver_charge") continue;
    if (String(payment.notes ?? "").trim() !== HIRE_DEPOSIT_APPLIED_TO_CHARGES_NOTE) continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export type HireDepositAppliedAmounts = {
  appliedToRentGbp: number;
  appliedToChargesGbp: number;
  appliedTotalGbp: number;
};

/**
 * Deposit amounts actually applied after disposition.
 * Prefer persisted rent-schedule / charge-credit facts — do not recompute from
 * remaining unpaid rent (that drops to £0 after apply and understates usage).
 */
export function resolveHireDepositAppliedAmounts(input: {
  disposition: string | null | undefined;
  depositReceivedGbp: number;
  appliedToRentFromEventsGbp: number;
  appliedToChargesFromPaymentsGbp: number;
}): HireDepositAppliedAmounts {
  const received = roundGbp(Math.max(0, input.depositReceivedGbp));
  if (received <= 0.005 || isDepositDispositionPending(input.disposition)) {
    return { appliedToRentGbp: 0, appliedToChargesGbp: 0, appliedTotalGbp: 0 };
  }

  let appliedToRentGbp = roundGbp(Math.max(0, input.appliedToRentFromEventsGbp));
  let appliedToChargesGbp = roundGbp(Math.max(0, input.appliedToChargesFromPaymentsGbp));
  let total = roundGbp(appliedToRentGbp + appliedToChargesGbp);
  if (total > received + 0.005) {
    appliedToRentGbp = roundGbp(Math.min(appliedToRentGbp, received));
    appliedToChargesGbp = roundGbp(Math.max(0, received - appliedToRentGbp));
    total = roundGbp(appliedToRentGbp + appliedToChargesGbp);
  }

  return {
    appliedToRentGbp,
    appliedToChargesGbp,
    appliedTotalGbp: total,
  };
}
