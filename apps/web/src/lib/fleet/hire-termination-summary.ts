import { ukLondonDayYmd } from "@/lib/datetime/uk";
import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import type { HireRentSettlementSummary } from "@/lib/fleet/hire-rent-settlement";
import {
  supportsEndOfPeriodBilling,
  type HireTerminationBillingPeriodBreakdown,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";
import type { RentCadence } from "@/lib/fleet/hire-types";
import { addGbp, roundGbp } from "@/lib/fleet/hire-money";
import { settlementCacheFromSignedGbp } from "@/lib/fleet/hire-open-balance";
import { formatGbp } from "@/lib/fleet/maintenance";

export const HIRE_DEPOSIT_DISPOSITIONS = [
  "apply_to_balance",
  "refund_full",
  "refund_partial",
  "forfeit",
  "hold_pending",
] as const;

export type HireDepositDisposition = (typeof HIRE_DEPOSIT_DISPOSITIONS)[number];

export const HIRE_DEPOSIT_REFUND_METHODS = [
  "bank_transfer",
  "cash",
  "card",
  "cheque",
  "other",
] as const;

export type HireDepositRefundMethod = (typeof HIRE_DEPOSIT_REFUND_METHODS)[number];

export type SettlementBalanceDirection = "driver_owes_company" | "company_owes_driver" | "settled";

export type HireUiAudience = "staff" | "driver";

export type HireTerminationAccountsSummary = {
  activatedAt: string | null;
  terminatedAt: string;
  durationDays: number;
  billedPeriods: number;
  /** Inclusive calendar days from contract effective start through termination (rent schedule basis). */
  rentBilledDurationDays: number;
  rentBilledPeriods: number;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  /** Accrued rent before discounts (schedule base amounts). */
  rentGrossAccruedGbp: number;
  accruedRentDueGbp: number;
  accruedRentPaidGbp: number;
  prepaidRentCreditGbp: number;
  accruedOverpaymentGbp: number;
  /** Staff/driver discounts on accrued rent periods (not pro-rata). */
  totalDiscountGbp: number;
  totalDueGbp: number;
  totalPaidGbp: number;
  balanceGbp: number;
  rentCreditGbp: number;
  signedRentBalanceGbp: number;
  depositGbp: number;
  /** Unpaid extra charges (damage, admin, etc.) still owed at contract end. */
  outstandingExtraChargesGbp: number;
  balanceDirection: SettlementBalanceDirection;
  /**
   * Rent position after deposit disposition (extras not included).
   * Use {@link overallTerminationPositionGbp} for the full amount tracked on the hire.
   */
  netSettlementGbp: number;
  rentBillingMode: HireTerminationRentBillingMode;
  billingPeriodBreakdown: HireTerminationBillingPeriodBreakdown | null;
};

/** Full hire position at end: rent (after deposit decision) + outstanding extras. */
export function overallTerminationPositionGbp(
  summary: Pick<HireTerminationAccountsSummary, "netSettlementGbp" | "outstandingExtraChargesGbp">,
): number {
  const extras = Number(summary.outstandingExtraChargesGbp);
  const safeExtras = Number.isFinite(extras) && extras > 0 ? roundGbp(extras) : 0;
  return addGbp(summary.netSettlementGbp, safeExtras);
}

export function resolveSettlementBalanceDirection(balanceGbp: number): SettlementBalanceDirection {
  return settlementCacheFromSignedGbp(balanceGbp).settlementBalanceDirection;
}

export function rentCadenceLabel(cadence: RentCadence): string {
  if (cadence === "daily") return "day";
  if (cadence === "weekly") return "week";
  return "month";
}

export function rentCadencePluralLabel(cadence: RentCadence): string {
  if (cadence === "daily") return "days";
  if (cadence === "weekly") return "weeks";
  return "months";
}

/** Whole billed periods based on cadence and inclusive hire duration. */
export function billedPeriodsForDuration(cadence: RentCadence, durationDays: number): number {
  if (durationDays <= 0) return 0;
  if (cadence === "daily") return durationDays;
  if (cadence === "weekly") return Math.ceil(durationDays / 7);
  return Math.ceil(durationDays / 30);
}

/** Human-readable hire length for payment summaries (e.g. "1 week and 4 days"). */
export function formatHireDurationWeeksAndDays(durationDays: number): string {
  if (durationDays <= 0) return "0 days";
  const weeks = Math.floor(durationDays / 7);
  const days = durationDays % 7;
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

/** Rent reduction from charging pro-rata on a partial final period — not a staff discount. */
export function hireProRataRentAdjustmentGbp(input: {
  rentGrossAccruedGbp: number;
  totalDiscountGbp: number;
  accruedRentDueGbp: number;
}): number {
  const fullPeriodNet = Math.round((input.rentGrossAccruedGbp - input.totalDiscountGbp) * 100) / 100;
  return Math.round(Math.max(0, fullPeriodNet - input.accruedRentDueGbp) * 100) / 100;
}

export type HireRentTerminationAdjustmentDisplay = {
  adjustmentGbp: number;
  lineLabel: string;
  footnote: string;
};

/** Staff-facing label and footnote for rent not charged at termination (pro-rata or early return). */
export function hireRentTerminationAdjustmentDisplay(input: {
  rentCadence: RentCadence;
  rentBillingMode: HireTerminationRentBillingMode;
  billingPeriodBreakdown: HireTerminationBillingPeriodBreakdown | null;
  rentGrossAccruedGbp: number;
  totalDiscountGbp: number;
  accruedRentDueGbp: number;
}): HireRentTerminationAdjustmentDisplay | null {
  const adjustmentGbp = hireProRataRentAdjustmentGbp({
    rentGrossAccruedGbp: input.rentGrossAccruedGbp,
    totalDiscountGbp: input.totalDiscountGbp,
    accruedRentDueGbp: input.accruedRentDueGbp,
  });
  if (adjustmentGbp <= 0.005) return null;

  if (
    input.billingPeriodBreakdown &&
    input.rentBillingMode === "actual" &&
    supportsEndOfPeriodBilling(input.rentCadence)
  ) {
    const { daysUsed, daysInPeriod } = input.billingPeriodBreakdown;
    const periodWord = input.rentCadence === "weekly" ? "week" : "month";
    return {
      adjustmentGbp,
      lineLabel: `Pro-rata adjustment (final ${periodWord})`,
      footnote: `${formatGbp(adjustmentGbp)} was not charged because the vehicle was returned after ${daysUsed} of ${daysInPeriod} days in the final billing ${periodWord}. This is not unpaid rent.`,
    };
  }

  if (input.rentCadence === "daily") {
    return {
      adjustmentGbp,
      lineLabel: "Rent not charged after return",
      footnote: `${formatGbp(adjustmentGbp)} of schedule rent after the return date is not charged. This is not unpaid rent.`,
    };
  }

  const periodWord = input.rentCadence === "weekly" ? "week" : "month";
  return {
    adjustmentGbp,
    lineLabel: "Early return adjustment",
    footnote: `${formatGbp(adjustmentGbp)} of the final ${periodWord} was not charged after early return. This is not unpaid rent.`,
  };
}

export function formatRentBilledThroughReturnLabel(
  rentCadence: RentCadence,
  rentBilledPeriods: number,
  rentBilledDurationDays: number,
): string {
  const unit =
    rentBilledPeriods === 1 ? rentCadenceLabel(rentCadence) : rentCadencePluralLabel(rentCadence);
  return `${rentBilledPeriods} ${unit} (${formatHireDurationWeeksAndDays(rentBilledDurationDays)})`;
}

export function netSettlementAfterDeposit(input: {
  balanceGbp: number;
  depositGbp: number;
  disposition: HireDepositDisposition;
  refundAmountGbp?: number | null;
}): number {
  const balance = Math.round(input.balanceGbp * 100) / 100;
  const deposit = Math.round(input.depositGbp * 100) / 100;
  if (deposit <= 0) return balance;

  if (input.disposition === "forfeit") {
    if (balance > 0) return Math.round(Math.max(0, balance - deposit) * 100) / 100;
    return balance;
  }

  if (input.disposition === "apply_to_balance") {
    return Math.round((balance - deposit) * 100) / 100;
  }
  if (input.disposition === "refund_full") {
    if (balance > 0.005) return balance;
    return Math.round((balance - deposit) * 100) / 100;
  }
  if (input.disposition === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, input.refundAmountGbp ?? 0));
    if (balance > 0.005) return balance;
    return Math.round((balance - refund) * 100) / 100;
  }
  return balance;
}

export function buildHireTerminationAccountsSummary(input: {
  activatedAt: string | null;
  terminatedAtIso: string;
  /** UK calendar day for termination accrual (staff return date when known). */
  terminatedYmd?: string | null;
  startDateYmd: string;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  paymentSummary: HirePaymentSummary;
  rentSettlement: HireRentSettlementSummary;
  depositGbp: number;
  depositDisposition?: HireDepositDisposition;
  depositRefundAmountGbp?: number | null;
  outstandingExtraChargesGbp?: number;
}): HireTerminationAccountsSummary {
  const terminatedYmd =
    input.terminatedYmd?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.terminatedYmd.trim())
      ? input.terminatedYmd.trim()
      : (ukLondonDayYmd(input.terminatedAtIso) ?? input.terminatedAtIso.slice(0, 10));
  const hireLengthFromYmd = input.activatedAt?.slice(0, 10) ?? input.startDateYmd;
  const durationDays = calendarDaysInclusive(hireLengthFromYmd, terminatedYmd);
  const rentBilledDurationDays = calendarDaysInclusive(input.startDateYmd, terminatedYmd);
  const rentBilledPeriods = billedPeriodsForDuration(input.rentCadence, rentBilledDurationDays);
  const disposition = input.depositDisposition ?? "hold_pending";
  const signedRentBalance = input.rentSettlement.signedRentSettlementGbp;
  const rentCreditGbp = Math.max(0, -signedRentBalance);
  const balanceGbp = Math.max(0, signedRentBalance);
  const extrasRaw = Number(input.outstandingExtraChargesGbp ?? 0);
  const outstandingExtraChargesGbp =
    Number.isFinite(extrasRaw) && extrasRaw > 0.005 ? Math.round(extrasRaw * 100) / 100 : 0;
  const netSettlementGbp = netSettlementAfterDeposit({
    balanceGbp: signedRentBalance,
    depositGbp: input.depositGbp,
    disposition,
    refundAmountGbp: input.depositRefundAmountGbp,
  });
  const overallPositionGbp = Math.round((netSettlementGbp + outstandingExtraChargesGbp) * 100) / 100;

  return {
    activatedAt: input.activatedAt,
    terminatedAt: input.terminatedAtIso,
    durationDays,
    billedPeriods: billedPeriodsForDuration(input.rentCadence, durationDays),
    rentBilledDurationDays,
    rentBilledPeriods,
    rentCadence: input.rentCadence,
    rentAmountGbp: input.rentAmountGbp,
    rentGrossAccruedGbp:
      Math.round(Math.max(0, input.paymentSummary.rentGrossAccruedGbp) * 100) / 100,
    accruedRentDueGbp: input.rentSettlement.accruedRentDueGbp,
    accruedRentPaidGbp: input.rentSettlement.accruedRentPaidGbp,
    prepaidRentCreditGbp: input.rentSettlement.prepaidRentCreditGbp,
    accruedOverpaymentGbp: input.rentSettlement.accruedOverpaymentGbp,
    totalDiscountGbp: Math.round(Math.max(0, input.paymentSummary.totalDiscountGbp) * 100) / 100,
    totalDueGbp: input.paymentSummary.totalDueGbp,
    totalPaidGbp: input.paymentSummary.totalPaidGbp,
    balanceGbp,
    rentCreditGbp,
    signedRentBalanceGbp: signedRentBalance,
    depositGbp: input.depositGbp,
    outstandingExtraChargesGbp,
    balanceDirection: resolveSettlementBalanceDirection(overallPositionGbp),
    netSettlementGbp,
    rentBillingMode: input.rentSettlement.billingMode,
    billingPeriodBreakdown: input.rentSettlement.billingPeriodBreakdown,
  };
}

export function settlementBalanceLabel(
  direction: SettlementBalanceDirection,
  amountGbp: number,
  audience: HireUiAudience = "staff",
): string {
  const amount = Math.abs(amountGbp).toFixed(2);
  if (direction === "settled") return "All clear — nothing owed";
  if (audience === "driver") {
    if (direction === "driver_owes_company") return `You owe £${amount}`;
    return `Owed to you: £${amount}`;
  }
  if (direction === "driver_owes_company") return `Driver owes £${amount}`;
  return `You owe driver £${amount}`;
}

export function hireDepositDispositionLabel(
  disposition: HireDepositDisposition,
  audience: HireUiAudience = "staff",
): string {
  const staffLabels: Record<HireDepositDisposition, string> = {
    apply_to_balance: "Use deposit to pay amount owed",
    refund_full: "Return full deposit",
    refund_partial: "Return part of deposit",
    forfeit: "Keep deposit (no refund)",
    hold_pending: "Hold deposit — decide later on Payments",
  };
  const driverLabels: Record<HireDepositDisposition, string> = {
    apply_to_balance: "Deposit used to pay what you owed",
    refund_full: "Full deposit returned to you",
    refund_partial: "Part of deposit returned to you",
    forfeit: "Deposit retained by rental company",
    hold_pending: "Deposit held — your rental company will confirm",
  };
  return (audience === "driver" ? driverLabels : staffLabels)[disposition];
}
