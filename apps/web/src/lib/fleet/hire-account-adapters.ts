/**
 * Adapters that map existing hire schedule / termination facts into
 * {@link buildHireAccountPosition}. Prefer these over page-local money math.
 */

import {
  buildHireAccountPosition,
  buildHireAccountPositionFromTerminationSummary,
  hireAccountSignedOpenGbp,
  hireSettlementCacheFromPosition,
  type HireAccountPosition,
} from "@/lib/fleet/hire-account-position";
import { clampNonNegativeGbp, addGbp, roundGbp } from "@/lib/fleet/hire-money";
import { settlementCacheFromSignedGbp } from "@/lib/fleet/hire-open-balance";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";

/** Active hire: schedule summary + deposit row + extras outstanding. */
export function buildActiveHireAccountPosition(input: {
  depositRequiredGbp: number;
  depositReceivedGbp: number;
  /** Accrued rent after discount (schedule total due to date). */
  rentChargedAfterDiscountGbp: number;
  rentPaidConfirmedGbp: number;
  /** Outstanding extras only (posted unpaid). */
  extraChargesOutstandingGbp: number;
  pendingPaymentsGbp?: number;
}): HireAccountPosition {
  return buildHireAccountPosition({
    lifecycle: "active",
    depositRequiredGbp: input.depositRequiredGbp,
    depositReceivedGbp: input.depositReceivedGbp,
    rentGrossChargedGbp: input.rentChargedAfterDiscountGbp,
    rentDiscountGbp: 0,
    rentPaidConfirmedGbp: input.rentPaidConfirmedGbp,
    extraChargesPostedGbp: clampNonNegativeGbp(input.extraChargesOutstandingGbp),
    extraChargePaymentsConfirmedGbp: 0,
    pendingPaymentsGbp: input.pendingPaymentsGbp,
  });
}

/** Ended / completed hire from termination snapshot + live extras & refunds. */
export function buildEndedHireAccountPosition(input: {
  terminationSummary: HireTerminationAccountsSummary;
  depositDisposition?: string | null;
  depositReceivedGbp?: number;
  /** Live extras still outstanding (add_to_balance net of receipts). */
  extraChargesOutstandingGbp?: number;
  /** Posted billable extras (add_to_balance + paid_now). */
  extraChargesPostedGbp?: number;
  extraChargePaymentsConfirmedGbp?: number;
  refundPaidGbp?: number;
  settlementReceivedFromDriverGbp?: number;
  lifecycle?: "ended" | "completed";
}): HireAccountPosition {
  const summary = input.terminationSummary;
  const extrasOutstanding = clampNonNegativeGbp(input.extraChargesOutstandingGbp ?? 0);
  const extrasPosted =
    input.extraChargesPostedGbp != null
      ? clampNonNegativeGbp(input.extraChargesPostedGbp)
      : extrasOutstanding;
  const extrasPaid =
    input.extraChargePaymentsConfirmedGbp != null
      ? clampNonNegativeGbp(input.extraChargePaymentsConfirmedGbp)
      : roundGbp(Math.max(0, extrasPosted - extrasOutstanding));

  const base = buildHireAccountPositionFromTerminationSummary(summary, {
    depositDisposition: input.depositDisposition,
    depositReceivedGbp: input.depositReceivedGbp,
    refundPaidGbp: input.refundPaidGbp,
    settlementReceivedFromDriverGbp: input.settlementReceivedFromDriverGbp,
    lifecycle: input.lifecycle ?? "ended",
  });

  // Preserve rent charged from the termination mapper (accrued due), not raw gross
  // which can differ when pro-rata cancelled the final period.
  return buildHireAccountPosition({
    lifecycle: input.lifecycle ?? "ended",
    depositRequiredGbp: base.depositRequiredGbp,
    depositReceivedGbp: base.depositReceivedGbp,
    rentGrossChargedGbp: addGbp(base.rentChargedGbp, summary.totalDiscountGbp),
    rentDiscountGbp: summary.totalDiscountGbp,
    rentPaidConfirmedGbp: base.rentPaidGbp,
    depositAppliedToRentGbp: base.depositAppliedToRentGbp,
    depositAppliedToChargesGbp: base.depositAppliedToChargesGbp,
    extraChargesPostedGbp: extrasPosted,
    extraChargePaymentsConfirmedGbp: extrasPaid,
    refundCalculatedGbp: base.refundCalculatedGbp,
    refundPaidGbp: input.refundPaidGbp ?? base.refundPaidGbp,
    settlementReceivedFromDriverGbp: input.settlementReceivedFromDriverGbp ?? 0,
    unallocatedCreditGbp: base.unallocatedCreditGbp,
  });
}

/** Settlement cache fields from a signed overall termination position. */
export function settlementCacheFromOverallTerminationGbp(signedOverallGbp: number) {
  return settlementCacheFromSignedGbp(signedOverallGbp);
}

export function settlementCacheFromHireAccountPosition(position: HireAccountPosition) {
  return hireSettlementCacheFromPosition(position);
}

export function signedOpenFromHireAccountPosition(position: HireAccountPosition): number {
  return hireAccountSignedOpenGbp(position);
}

/** True when persisted settlement cache does not match live account position. */
export function settlementCacheOutOfSyncWithPosition(
  cache: {
    settlementBalanceGbp: number;
    settlementBalanceDirection: string | null;
  },
  position: HireAccountPosition,
): boolean {
  const expected = hireSettlementCacheFromPosition(position);
  if (expected.settlementBalanceDirection === "settled") {
    return (
      cache.settlementBalanceDirection != null &&
      cache.settlementBalanceDirection !== "settled" &&
      Number(cache.settlementBalanceGbp) > 0.005
    );
  }
  return (
    cache.settlementBalanceDirection !== expected.settlementBalanceDirection ||
    Math.abs(Number(cache.settlementBalanceGbp) - expected.settlementBalanceGbp) > 0.005
  );
}
