import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import type { HireRentSettlementSummary } from "@/lib/fleet/hire-rent-settlement";
import type {
  HireTerminationBillingPeriodBreakdown,
  HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";
import type { RentCadence } from "@/lib/fleet/hire-types";

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

export type HireTerminationAccountsSummary = {
  activatedAt: string | null;
  terminatedAt: string;
  durationDays: number;
  billedPeriods: number;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  accruedRentDueGbp: number;
  accruedRentPaidGbp: number;
  prepaidRentCreditGbp: number;
  accruedOverpaymentGbp: number;
  totalDueGbp: number;
  totalPaidGbp: number;
  balanceGbp: number;
  rentCreditGbp: number;
  signedRentBalanceGbp: number;
  depositGbp: number;
  balanceDirection: SettlementBalanceDirection;
  netSettlementGbp: number;
  rentBillingMode: HireTerminationRentBillingMode;
  billingPeriodBreakdown: HireTerminationBillingPeriodBreakdown | null;
};

export function resolveSettlementBalanceDirection(balanceGbp: number): SettlementBalanceDirection {
  if (balanceGbp > 0.005) return "driver_owes_company";
  if (balanceGbp < -0.005) return "company_owes_driver";
  return "settled";
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

  if (
    input.disposition === "apply_to_balance" ||
    input.disposition === "refund_full"
  ) {
    return Math.round((balance - deposit) * 100) / 100;
  }
  if (input.disposition === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, input.refundAmountGbp ?? 0));
    return Math.round((balance - refund) * 100) / 100;
  }
  return balance;
}

export function buildHireTerminationAccountsSummary(input: {
  activatedAt: string | null;
  terminatedAtIso: string;
  startDateYmd: string;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  paymentSummary: HirePaymentSummary;
  rentSettlement: HireRentSettlementSummary;
  depositGbp: number;
  depositDisposition?: HireDepositDisposition;
  depositRefundAmountGbp?: number | null;
}): HireTerminationAccountsSummary {
  const terminatedYmd = input.terminatedAtIso.slice(0, 10);
  const fromYmd = input.activatedAt?.slice(0, 10) ?? input.startDateYmd;
  const durationDays = calendarDaysInclusive(fromYmd, terminatedYmd);
  const disposition = input.depositDisposition ?? "hold_pending";
  const signedRentBalance = input.rentSettlement.signedRentSettlementGbp;
  const rentCreditGbp = Math.max(0, -signedRentBalance);
  const balanceGbp = Math.max(0, signedRentBalance);
  const netSettlementGbp = netSettlementAfterDeposit({
    balanceGbp: signedRentBalance,
    depositGbp: input.depositGbp,
    disposition,
    refundAmountGbp: input.depositRefundAmountGbp,
  });

  return {
    activatedAt: input.activatedAt,
    terminatedAt: input.terminatedAtIso,
    durationDays,
    billedPeriods: billedPeriodsForDuration(input.rentCadence, durationDays),
    rentCadence: input.rentCadence,
    rentAmountGbp: input.rentAmountGbp,
    accruedRentDueGbp: input.rentSettlement.accruedRentDueGbp,
    accruedRentPaidGbp: input.rentSettlement.accruedRentPaidGbp,
    prepaidRentCreditGbp: input.rentSettlement.prepaidRentCreditGbp,
    accruedOverpaymentGbp: input.rentSettlement.accruedOverpaymentGbp,
    totalDueGbp: input.paymentSummary.totalDueGbp,
    totalPaidGbp: input.paymentSummary.totalPaidGbp,
    balanceGbp,
    rentCreditGbp,
    signedRentBalanceGbp: signedRentBalance,
    depositGbp: input.depositGbp,
    balanceDirection: resolveSettlementBalanceDirection(netSettlementGbp),
    netSettlementGbp,
    rentBillingMode: input.rentSettlement.billingMode,
    billingPeriodBreakdown: input.rentSettlement.billingPeriodBreakdown,
  };
}

export function settlementBalanceLabel(direction: SettlementBalanceDirection, amountGbp: number): string {
  const amount = Math.abs(amountGbp).toFixed(2);
  if (direction === "driver_owes_company") return `Driver owes £${amount}`;
  if (direction === "company_owes_driver") return `You owe driver £${amount}`;
  return "All clear — nothing owed";
}

export function hireDepositDispositionLabel(disposition: HireDepositDisposition): string {
  const labels: Record<HireDepositDisposition, string> = {
    apply_to_balance: "Use deposit to pay rent owed",
    refund_full: "Return full deposit",
    refund_partial: "Return part of deposit",
    forfeit: "Keep deposit (no refund)",
    hold_pending: "Hold deposit — decide later on Payments",
  };
  return labels[disposition];
}
