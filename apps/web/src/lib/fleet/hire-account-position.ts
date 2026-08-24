/**
 * Authoritative hire financial account position.
 *
 * All operational surfaces (Payments, Balances, end-hire, final account, statements)
 * must consume this result — do not re-sum balances in page components.
 *
 * Deposit held is never treated as rent income here. P&L remains in hire-income.ts.
 */

import {
  addGbp,
  clampNonNegativeGbp,
  isZeroGbp,
  minGbp,
  roundGbp,
  subGbp,
} from "@/lib/fleet/hire-money";
import { depositRentScheduleCreditGbp } from "@/lib/fleet/hire-deposit-schedule-allocation";

export type HireAccountDirection = "driver_owes_company" | "company_owes_driver" | "settled";

export type HireAccountStatus =
  | "active"
  | "final_account_open"
  | "driver_payment_pending"
  | "refund_pending"
  | "partially_settled"
  | "fully_settled"
  | "deposit_outstanding";

/**
 * Confirmed facts only. Pending amounts are passed separately and never reduce
 * confirmed outstanding figures.
 */
export type HireAccountPositionInput = {
  /** Contractual deposit expected (0 if none). */
  depositRequiredGbp: number;
  /** Confirmed deposit money received (approved). */
  depositReceivedGbp: number;

  /** Accrued / charged rent before discount (not future schedule). */
  rentGrossChargedGbp: number;
  rentDiscountGbp: number;
  /** Confirmed rent payments (approved schedule), excluding deposit. */
  rentPaidConfirmedGbp: number;
  /** Future rent still scheduled but not chargeable yet. */
  rentFutureGbp?: number;
  /** Visible rent reduction from early end / pro-rata (informational). */
  rentAdjustmentGbp?: number;

  /**
   * Posted extra charges that count toward total charges
   * (add_to_balance + paid_now; not waived).
   */
  extraChargesPostedGbp: number;
  /** Confirmed receipts allocated to extra charges (not pending). */
  extraChargePaymentsConfirmedGbp: number;

  /**
   * Formal deposit allocations (only after disposition / explicit apply).
   * Must not exceed deposit received.
   */
  depositAppliedToRentGbp?: number;
  depositAppliedToChargesGbp?: number;

  /**
   * Refund calculated as unused received deposit (and similar credits) owed to driver.
   * Paid separately via ledger.
   */
  refundCalculatedGbp?: number;
  refundApprovedGbp?: number;
  refundPaidGbp?: number;

  /** Confirmed settlement receipts from driver against the final account (not rent schedule). */
  settlementReceivedFromDriverGbp?: number;
  /** Confirmed settlement payouts to driver that are not counted in refundPaidGbp. */
  settlementPaidToDriverGbp?: number;

  /** Pending submissions — display only; never reduce confirmed balance. */
  pendingPaymentsGbp?: number;

  /** Unallocated confirmed credit on the account. */
  unallocatedCreditGbp?: number;

  /** Hire lifecycle hint for status labelling. */
  lifecycle?: "active" | "ended" | "completed";
};

export type HireAccountPosition = {
  rentScheduledGbp: number;
  rentChargedGbp: number;
  rentAdjustmentGbp: number;
  rentPaidGbp: number;
  rentOutstandingGbp: number;
  futureRentGbp: number;

  extraChargesPostedGbp: number;
  extraChargePaymentsGbp: number;
  extraChargesOutstandingGbp: number;

  depositRequiredGbp: number;
  depositReceivedGbp: number;
  depositOutstandingGbp: number;
  depositAvailableGbp: number;
  depositAppliedToRentGbp: number;
  depositAppliedToChargesGbp: number;
  depositAppliedTotalGbp: number;

  refundCalculatedGbp: number;
  refundApprovedGbp: number;
  refundPaidGbp: number;
  refundOutstandingGbp: number;

  confirmedPaymentsGbp: number;
  pendingPaymentsGbp: number;
  unallocatedCreditGbp: number;

  totalConfirmedChargesGbp: number;
  totalToCollectGbp: number;

  amountDriverOwesCompanyGbp: number;
  amountCompanyOwesDriverGbp: number;

  accountDirection: HireAccountDirection;
  accountStatus: HireAccountStatus;

  /** True when deposit money is held but not yet allocated or refunded. */
  depositHeldSeparately: boolean;
};

function safeGbp(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return roundGbp(value);
}

/**
 * Build the single hire-account position from confirmed financial facts.
 */
export function buildHireAccountPosition(input: HireAccountPositionInput): HireAccountPosition {
  const depositRequiredGbp = clampNonNegativeGbp(safeGbp(input.depositRequiredGbp));
  const depositReceivedRawGbp = clampNonNegativeGbp(safeGbp(input.depositReceivedGbp));
  const depositReceivedEffectiveGbp =
    depositRequiredGbp > 0.005
      ? minGbp(depositRequiredGbp, depositReceivedRawGbp)
      : depositReceivedRawGbp;

  const rentGrossChargedGbp = clampNonNegativeGbp(safeGbp(input.rentGrossChargedGbp));
  const rentDiscountGbp = minGbp(
    rentGrossChargedGbp,
    clampNonNegativeGbp(safeGbp(input.rentDiscountGbp)),
  );
  const rentChargedGbp = clampNonNegativeGbp(subGbp(rentGrossChargedGbp, rentDiscountGbp));
  const rentAdjustmentGbp = clampNonNegativeGbp(safeGbp(input.rentAdjustmentGbp));
  const rentPaidConfirmedGbp = clampNonNegativeGbp(safeGbp(input.rentPaidConfirmedGbp));
  const rentFutureGbp = clampNonNegativeGbp(safeGbp(input.rentFutureGbp));

  let depositAppliedToRentGbp = clampNonNegativeGbp(safeGbp(input.depositAppliedToRentGbp));
  let depositAppliedToChargesGbp = clampNonNegativeGbp(safeGbp(input.depositAppliedToChargesGbp));
  // Never apply more deposit than was received.
  const appliedCap = depositReceivedEffectiveGbp;
  let appliedTotal = addGbp(depositAppliedToRentGbp, depositAppliedToChargesGbp);
  if (appliedTotal > appliedCap + 0.0001) {
    // Prefer keeping rent allocation, then charges.
    depositAppliedToRentGbp = minGbp(depositAppliedToRentGbp, appliedCap);
    depositAppliedToChargesGbp = clampNonNegativeGbp(
      subGbp(appliedCap, depositAppliedToRentGbp),
    );
    appliedTotal = addGbp(depositAppliedToRentGbp, depositAppliedToChargesGbp);
  }

  // Rent outstanding after confirmed rent payments + formal deposit applied to rent.
  const rentCoveredGbp = addGbp(rentPaidConfirmedGbp, depositAppliedToRentGbp);
  const rentOutstandingGbp = clampNonNegativeGbp(subGbp(rentChargedGbp, rentCoveredGbp));

  const extraChargesPostedGbp = clampNonNegativeGbp(safeGbp(input.extraChargesPostedGbp));
  const extraChargePaymentsConfirmedGbp = clampNonNegativeGbp(
    safeGbp(input.extraChargePaymentsConfirmedGbp),
  );
  // Deposit applied to charges reduces extras outstanding.
  const extrasCoveredGbp = addGbp(extraChargePaymentsConfirmedGbp, depositAppliedToChargesGbp);
  const extraChargesOutstandingGbp = clampNonNegativeGbp(
    subGbp(extraChargesPostedGbp, extrasCoveredGbp),
  );

  const settlementReceivedGbp = clampNonNegativeGbp(safeGbp(input.settlementReceivedFromDriverGbp));
  const settlementPaidToDriverGbp = clampNonNegativeGbp(safeGbp(input.settlementPaidToDriverGbp));
  const unallocatedCreditGbp = clampNonNegativeGbp(safeGbp(input.unallocatedCreditGbp));
  const pendingPaymentsGbp = clampNonNegativeGbp(safeGbp(input.pendingPaymentsGbp));
  const lifecycle = input.lifecycle ?? "active";

  // Fact: contractual deposit still unpaid (even after end — does not affect totalToCollect when ended).
  const depositOutstandingGbp = clampNonNegativeGbp(
    subGbp(depositRequiredGbp, depositReceivedEffectiveGbp),
  );

  const refundCalculatedGbp = clampNonNegativeGbp(safeGbp(input.refundCalculatedGbp));
  const refundApprovedGbp = clampNonNegativeGbp(
    safeGbp(input.refundApprovedGbp ?? input.refundCalculatedGbp),
  );
  const refundPaidGbp = clampNonNegativeGbp(safeGbp(input.refundPaidGbp));
  const refundOutstandingGbp = clampNonNegativeGbp(subGbp(refundCalculatedGbp, refundPaidGbp));

  // Available deposit = received − allocated − refunded (and not still "due" as refund calc overflow).
  const depositConsumedGbp = addGbp(appliedTotal, refundPaidGbp);
  let depositAvailableGbp = clampNonNegativeGbp(
    subGbp(depositReceivedEffectiveGbp, depositConsumedGbp),
  );
  // If a refund has been calculated against remaining deposit, it is no longer "available" to allocate.
  if (refundCalculatedGbp > 0.005) {
    const reservedForRefund = minGbp(
      depositAvailableGbp,
      clampNonNegativeGbp(subGbp(refundCalculatedGbp, refundPaidGbp)),
    );
    depositAvailableGbp = clampNonNegativeGbp(subGbp(depositAvailableGbp, reservedForRefund));
  }

  const totalConfirmedChargesGbp = addGbp(rentChargedGbp, extraChargesPostedGbp);

  // Charge-side amount driver owes (deposit outstanding is separate — see totalToCollect).
  let chargeSideOwedGbp = addGbp(rentOutstandingGbp, extraChargesOutstandingGbp);
  chargeSideOwedGbp = clampNonNegativeGbp(
    subGbp(chargeSideOwedGbp, addGbp(settlementReceivedGbp, unallocatedCreditGbp)),
  );

  // Company may owe refund + any settlement payouts not already in refundPaid.
  const companyOwesDriverGbp = addGbp(refundOutstandingGbp, settlementPaidToDriverGbp);

  let amountDriverOwesCompanyGbp = chargeSideOwedGbp;
  let amountCompanyOwesDriverGbp = companyOwesDriverGbp;

  // Net opposing charge/refund obligations (deposit outstanding stays separate).
  if (amountDriverOwesCompanyGbp > 0.005 && amountCompanyOwesDriverGbp > 0.005) {
    const net = subGbp(amountDriverOwesCompanyGbp, amountCompanyOwesDriverGbp);
    if (net > 0.005) {
      amountDriverOwesCompanyGbp = net;
      amountCompanyOwesDriverGbp = 0;
    } else if (net < -0.005) {
      amountCompanyOwesDriverGbp = clampNonNegativeGbp(subGbp(0, net));
      amountDriverOwesCompanyGbp = 0;
    } else {
      amountDriverOwesCompanyGbp = 0;
      amountCompanyOwesDriverGbp = 0;
    }
  }

  const totalToCollectGbp =
    lifecycle === "active"
      ? addGbp(amountDriverOwesCompanyGbp, depositOutstandingGbp)
      : amountDriverOwesCompanyGbp;

  let accountDirection: HireAccountDirection;
  if (amountDriverOwesCompanyGbp > 0.005) {
    accountDirection = "driver_owes_company";
  } else if (lifecycle === "active" && depositOutstandingGbp > 0.005) {
    accountDirection = "driver_owes_company";
  } else if (amountCompanyOwesDriverGbp > 0.005) {
    accountDirection = "company_owes_driver";
  } else {
    accountDirection = "settled";
  }

  const depositHeldSeparately =
    depositReceivedEffectiveGbp > 0.005 &&
    depositAvailableGbp > 0.005 &&
    appliedTotal <= 0.005 &&
    refundCalculatedGbp <= 0.005;

  const confirmedPaymentsGbp = addGbp(
    rentPaidConfirmedGbp,
    extraChargePaymentsConfirmedGbp,
    settlementReceivedGbp,
    depositReceivedEffectiveGbp,
  );

  const accountStatus = resolveAccountStatus({
    lifecycle,
    accountDirection,
    amountDriverOwesCompanyGbp,
    amountCompanyOwesDriverGbp,
    depositOutstandingGbp: lifecycle === "active" ? depositOutstandingGbp : 0,
    refundOutstandingGbp,
    pendingPaymentsGbp,
    totalToCollectGbp,
  });

  return {
    rentScheduledGbp: addGbp(rentChargedGbp, rentFutureGbp),
    rentChargedGbp,
    rentAdjustmentGbp,
    rentPaidGbp: rentPaidConfirmedGbp,
    rentOutstandingGbp,
    futureRentGbp: rentFutureGbp,

    extraChargesPostedGbp,
    extraChargePaymentsGbp: extraChargePaymentsConfirmedGbp,
    extraChargesOutstandingGbp,

    depositRequiredGbp,
    depositReceivedGbp: depositReceivedEffectiveGbp,
    depositOutstandingGbp,
    depositAvailableGbp,
    depositAppliedToRentGbp,
    depositAppliedToChargesGbp,
    depositAppliedTotalGbp: appliedTotal,

    refundCalculatedGbp,
    refundApprovedGbp,
    refundPaidGbp,
    refundOutstandingGbp,

    confirmedPaymentsGbp,
    pendingPaymentsGbp,
    unallocatedCreditGbp,

    totalConfirmedChargesGbp,
    totalToCollectGbp,

    amountDriverOwesCompanyGbp,
    amountCompanyOwesDriverGbp,

    accountDirection,
    accountStatus,
    depositHeldSeparately,
  };
}

function resolveAccountStatus(input: {
  lifecycle: "active" | "ended" | "completed";
  accountDirection: HireAccountDirection;
  amountDriverOwesCompanyGbp: number;
  amountCompanyOwesDriverGbp: number;
  depositOutstandingGbp: number;
  refundOutstandingGbp: number;
  pendingPaymentsGbp: number;
  totalToCollectGbp: number;
}): HireAccountStatus {
  if (input.lifecycle === "active") {
    if (input.depositOutstandingGbp > 0.005 && isZeroGbp(input.amountDriverOwesCompanyGbp)) {
      return "deposit_outstanding";
    }
    return "active";
  }

  if (
    input.accountDirection === "settled" &&
    input.refundOutstandingGbp <= 0.005 &&
    input.depositOutstandingGbp <= 0.005 &&
    input.pendingPaymentsGbp <= 0.005 &&
    input.totalToCollectGbp <= 0.005
  ) {
    return "fully_settled";
  }

  if (input.pendingPaymentsGbp > 0.005) return "driver_payment_pending";
  if (input.refundOutstandingGbp > 0.005) {
    if (input.amountCompanyOwesDriverGbp > 0.005 && input.refundOutstandingGbp < input.amountCompanyOwesDriverGbp + input.refundOutstandingGbp) {
      return input.refundOutstandingGbp > 0.005 && input.amountDriverOwesCompanyGbp <= 0.005
        ? "refund_pending"
        : "partially_settled";
    }
    return "refund_pending";
  }
  if (input.depositOutstandingGbp > 0.005) return "deposit_outstanding";
  if (input.amountDriverOwesCompanyGbp > 0.005) return "final_account_open";
  if (input.amountCompanyOwesDriverGbp > 0.005) return "refund_pending";
  return "partially_settled";
}

/** Convenience: who-owes-whom amount for banners (absolute). */
export function hireAccountOpenAmountGbp(position: HireAccountPosition): number {
  if (position.accountDirection === "driver_owes_company") {
    return position.amountDriverOwesCompanyGbp;
  }
  if (position.accountDirection === "company_owes_driver") {
    return position.amountCompanyOwesDriverGbp;
  }
  return 0;
}

/** Signed open amount: driver owes positive, company owes negative. */
export function hireAccountSignedOpenGbp(position: HireAccountPosition): number {
  if (position.accountDirection === "driver_owes_company") {
    return position.amountDriverOwesCompanyGbp;
  }
  if (position.accountDirection === "company_owes_driver") {
    return -position.amountCompanyOwesDriverGbp;
  }
  return 0;
}

/** Persistable settlement cache from an account position (charge-side only). */
export function hireSettlementCacheFromPosition(position: HireAccountPosition): {
  settlementBalanceGbp: number;
  settlementBalanceDirection: HireAccountDirection;
} {
  if (position.accountDirection === "settled") {
    return { settlementBalanceGbp: 0, settlementBalanceDirection: "settled" };
  }
  if (position.accountDirection === "driver_owes_company") {
    return {
      settlementBalanceGbp: position.amountDriverOwesCompanyGbp,
      settlementBalanceDirection: "driver_owes_company",
    };
  }
  return {
    settlementBalanceGbp: position.amountCompanyOwesDriverGbp,
    settlementBalanceDirection: "company_owes_driver",
  };
}

/**
 * Map a termination accounts summary into the authoritative account position.
 * Deposit apply uses disposition; unpaid deposit is not inventively allocated.
 */
export function buildHireAccountPositionFromTerminationSummary(
  summary: {
    rentGrossAccruedGbp: number;
    accruedRentDueGbp: number;
    totalDiscountGbp: number;
    accruedRentPaidGbp: number;
    prepaidRentCreditGbp: number;
    accruedOverpaymentGbp: number;
    depositGbp: number;
    signedRentBalanceGbp: number;
    outstandingExtraChargesGbp: number;
  },
  options?: {
    depositDisposition?: string | null;
    depositReceivedGbp?: number;
    depositRefundAmountGbp?: number | null;
    refundPaidGbp?: number;
    settlementReceivedFromDriverGbp?: number;
    lifecycle?: "ended" | "completed";
  },
): HireAccountPosition {
  const disposition = options?.depositDisposition ?? "hold_pending";
  const depositRequiredGbp = clampNonNegativeGbp(safeGbp(summary.depositGbp));
  const depositReceivedGbp = clampNonNegativeGbp(
    safeGbp(options?.depositReceivedGbp ?? summary.depositGbp),
  );
  // Accrued rent due is the billed amount after pro-rata/cancel; prefer it over gross schedule.
  const rentGross = addGbp(summary.accruedRentDueGbp, summary.totalDiscountGbp);

  const depositAppliedToRentGbp = depositRentScheduleCreditGbp({
    disposition,
    depositGbp: depositReceivedGbp,
    signedRentBalanceGbp: Math.max(0, summary.signedRentBalanceGbp),
    depositRefundAmountGbp: options?.depositRefundAmountGbp,
  });

  let refundCalculatedGbp = 0;
  if (disposition === "refund_full") {
    refundCalculatedGbp = depositReceivedGbp;
  } else if (disposition === "refund_partial") {
    refundCalculatedGbp = clampNonNegativeGbp(
      safeGbp(options?.depositRefundAmountGbp),
    );
  }

  return buildHireAccountPosition({
    lifecycle: options?.lifecycle ?? "ended",
    depositRequiredGbp,
    depositReceivedGbp,
    rentGrossChargedGbp: rentGross,
    rentDiscountGbp: summary.totalDiscountGbp,
    rentPaidConfirmedGbp: summary.accruedRentPaidGbp,
    depositAppliedToRentGbp,
    extraChargesPostedGbp: summary.outstandingExtraChargesGbp,
    extraChargePaymentsConfirmedGbp: 0,
    refundCalculatedGbp,
    refundPaidGbp: options?.refundPaidGbp ?? 0,
    settlementReceivedFromDriverGbp: options?.settlementReceivedFromDriverGbp ?? 0,
    unallocatedCreditGbp: addGbp(
      summary.prepaidRentCreditGbp,
      summary.accruedOverpaymentGbp,
    ),
  });
}
