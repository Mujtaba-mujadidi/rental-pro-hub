import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import { formatUkDateRangeText } from "@/lib/datetime/uk";
import type { HirePaymentHealthSummary } from "@/lib/fleet/hire-payment-analytics";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  formatHireDurationWeeksAndDays,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function hireDepositAppliedToRentGbp(summary: HireTerminationAccountsSummary): number {
  return roundGbp(Math.max(0, summary.accruedRentDueGbp - summary.accruedRentPaidGbp));
}

export function sumDriverChargesGbp(items: readonly HireDriverChargeWorkspaceRow[]): number {
  return roundGbp(
    items
      .filter((item) => item.resolution === "add_to_balance" || item.resolution === "paid_now")
      .reduce((sum, item) => sum + item.amountGbp, 0),
  );
}

export function countBillableDriverCharges(items: readonly HireDriverChargeWorkspaceRow[]): number {
  return items.filter(
    (item) =>
      (item.resolution === "add_to_balance" || item.resolution === "paid_now") && item.amountGbp > 0.005,
  ).length;
}

export function formatDriverChargesHint(
  count: number,
  audience: "staff" | "driver" = "staff",
): string {
  if (count <= 0) {
    return audience === "driver" ? "No charges on your account" : "No driver charges recorded";
  }
  const noun = count === 1 ? "charge" : "charges";
  return audience === "driver"
    ? `${count} ${noun} applied after vehicle return`
    : `${count} damage ${noun} after check-in`;
}

export function formatRefundPaidHintForAudience(
  paymentCount: number,
  audience: "staff" | "driver" = "staff",
): string {
  if (paymentCount <= 0) {
    return audience === "driver" ? "No refund payments yet" : "No refund payments recorded";
  }
  const noun = paymentCount === 1 ? "bank transfer" : "bank transfers";
  return audience === "driver"
    ? `Received in ${paymentCount} ${noun}`
    : `Paid in ${paymentCount} ${noun}`;
}

export function formatRentSettledHint(
  rentPaidGbp: number,
  depositAppliedGbp: number,
): string {
  const parts: string[] = [];
  if (rentPaidGbp > 0.005) parts.push(`${formatGbp(rentPaidGbp)} paid`);
  if (depositAppliedGbp > 0.005) parts.push(`${formatGbp(depositAppliedGbp)} from deposit`);
  if (!parts.length) return "No rent settlement recorded";
  return parts.join(" + ");
}

export function formatRefundPaidHint(paymentCount: number): string {
  if (paymentCount <= 0) return "No refund payments recorded";
  const noun = paymentCount === 1 ? "bank transfer" : "bank transfers";
  return `Paid in ${paymentCount} ${noun}`;
}

export type HireEndedRefundCalculation = {
  originalDepositGbp: number;
  advanceRentToRefundGbp: number;
  rentFromDepositGbp: number;
  driverChargesGbp: number;
  advanceRentRefundedGbp: number;
  depositRefundedGbp: number;
  finalRefundPaidGbp: number;
  visible: boolean;
};

export function buildHireEndedRefundCalculation(input: {
  terminationSummary: HireTerminationAccountsSummary | null;
  driverChargesGbp: number;
  settlementPaymentsToDriverGbp: number;
}): HireEndedRefundCalculation | null {
  const summary = input.terminationSummary;
  if (!summary) return null;
  const advanceRentToRefundGbp = roundGbp(
    Math.max(0, summary.prepaidRentCreditGbp) + Math.max(0, summary.accruedOverpaymentGbp),
  );
  if (summary.depositGbp <= 0.005 && advanceRentToRefundGbp <= 0.005) return null;

  const rentFromDepositGbp = hireDepositAppliedToRentGbp(summary);
  const driverChargesGbp = roundGbp(input.driverChargesGbp);
  const finalRefundPaidGbp = roundGbp(input.settlementPaymentsToDriverGbp);
  const advanceRentRefundedGbp = roundGbp(Math.min(advanceRentToRefundGbp, finalRefundPaidGbp));
  const depositRefundedGbp = roundGbp(Math.max(0, finalRefundPaidGbp - advanceRentRefundedGbp));
  const visible =
    rentFromDepositGbp > 0.005 ||
    driverChargesGbp > 0.005 ||
    finalRefundPaidGbp > 0.005 ||
    advanceRentToRefundGbp > 0.005;

  return {
    originalDepositGbp: summary.depositGbp,
    advanceRentToRefundGbp,
    rentFromDepositGbp,
    driverChargesGbp,
    advanceRentRefundedGbp,
    depositRefundedGbp,
    finalRefundPaidGbp,
    visible,
  };
}

export type HireEndedOutstandingBalance = {
  amountGbp: number;
  settled: boolean;
  kicker: string | null;
  headline: string;
  detail: string | null;
  statusLabel: string;
};

export function buildHireEndedOutstandingBalance(
  payments: Pick<HirePaymentsPageData, "settlementBalance" | "currentSignedSettlementGbp">,
  options?: { refundPaidGbp?: number; audience?: "staff" | "driver" },
): HireEndedOutstandingBalance {
  const audience = options?.audience ?? "staff";
  const openBalanceGbp = roundGbp(
    payments.settlementBalance?.openBalanceGbp ?? Math.abs(payments.currentSignedSettlementGbp),
  );
  const settled =
    payments.settlementBalance?.settled === true ||
    openBalanceGbp <= 0.005 ||
    payments.settlementBalance?.settlementDirection === "settled";

  if (settled) {
    const refundPaidGbp = roundGbp(options?.refundPaidGbp ?? 0);
    return {
      amountGbp: 0,
      settled: true,
      kicker: audience === "driver" ? "Hire completed" : "Hire and settlement completed",
      headline: audience === "driver" ? "You have nothing outstanding" : "Nothing is currently owed",
      detail:
        refundPaidGbp > 0.005
          ? audience === "driver"
            ? "Your hire is complete and your final refund has been paid."
            : "The hire is complete and the driver’s final refund has been paid."
          : audience === "driver"
            ? "Your hire is complete and all amounts are settled."
            : "The hire is complete and all amounts are settled.",
      statusLabel: "All clear",
    };
  }

  const direction = payments.settlementBalance?.settlementDirection;
  const headline =
    direction === "company_owes_driver"
      ? audience === "driver"
        ? `${formatGbp(openBalanceGbp)} refund still due to you`
        : `${formatGbp(openBalanceGbp)} refund still due`
      : audience === "driver"
        ? `${formatGbp(openBalanceGbp)} still outstanding`
        : `${formatGbp(openBalanceGbp)} still outstanding`;
  const detail =
    direction === "company_owes_driver"
      ? audience === "driver"
        ? "Your final refund payment is still being processed on this hire."
        : "Settlement payments to the driver are still open on this hire."
      : audience === "driver"
        ? "You still owe this amount after your hire ended."
        : "The driver still owes this amount after contract end.";

  return {
    amountGbp: openBalanceGbp,
    settled: false,
    kicker: null,
    headline,
    detail,
    statusLabel: direction === "company_owes_driver" ? "Refund due" : "Outstanding",
  };
}

const ENDED_PAYMENT_RATING_LABEL = {
  on_track: "Good",
  attention: "Fair",
  at_risk: "Poor",
} as const;

export type HireEndedPaymentRatingDisplay = {
  level: keyof typeof ENDED_PAYMENT_RATING_LABEL;
  label: string;
  detail: string;
  scorePercent: number | null;
};

export function buildEndedHirePaymentRatingDisplay(input: {
  health: HirePaymentHealthSummary;
  outstanding: HireEndedOutstandingBalance;
  audience?: "staff" | "driver";
}): HireEndedPaymentRatingDisplay {
  const { health, outstanding } = input;
  const audience = input.audience ?? "staff";
  let level: keyof typeof ENDED_PAYMENT_RATING_LABEL = health.level;
  if (!outstanding.settled && level === "on_track") level = "attention";

  let detail: string;
  if (!outstanding.settled) {
    detail =
      audience === "driver"
        ? "Settlement is not fully closed yet. Your rating reflects how rent was paid during the hire and may change when the final balance is cleared."
        : "Settlement is not fully closed yet. The rating reflects payment behaviour during the hire and may change when the final balance is cleared.";
  } else if (level === "on_track") {
    detail =
      audience === "driver"
        ? "You paid rent on time throughout this hire."
        : "Rent and settlement payments were recorded on time for this hire.";
  } else if (health.detail) {
    detail = health.detail;
  } else {
    detail = "Some rent periods were paid late or remain outstanding on the schedule.";
  }

  return {
    level,
    label: ENDED_PAYMENT_RATING_LABEL[level],
    detail,
    scorePercent: health.onTimePercent,
  };
}

export type HireEndedGlanceDisplay = {
  hirePeriodLabel: string;
  rentLabel: string;
  depositReceivedLabel: string;
  contractEndedLabel: string;
};

export function buildHireEndedGlanceDisplay(input: {
  context: HireOverviewContext;
  payments: Pick<
    HirePaymentsPageData,
    "terminationSummary" | "contractEndedYmd" | "depositGbp" | "contractEndedAtLabel"
  >;
}): HireEndedGlanceDisplay {
  const summary = input.payments.terminationSummary;
  const endYmd =
    input.payments.contractEndedYmd ??
    (summary?.terminatedAt ? summary.terminatedAt.slice(0, 10) : null);
  const startYmd = summary?.activatedAt ? summary.activatedAt.slice(0, 10) : null;

  return {
    hirePeriodLabel: startYmd && endYmd ? formatUkDateRangeText(startYmd, endYmd) : "—",
    rentLabel: input.context.rentLabel ?? "—",
    depositReceivedLabel:
      input.payments.depositGbp != null && input.payments.depositGbp > 0.005
        ? formatGbp(input.payments.depositGbp)
        : "—",
    contractEndedLabel: input.payments.contractEndedAtLabel ?? input.context.endedAtLabel ?? "—",
  };
}

export function buildHireEndedHeroMetrics(input: {
  payments: Pick<HirePaymentsPageData, "terminationSummary" | "contractEndedYmd">;
}): { hirePeriodLabel: string; timeOnHireLabel: string } {
  const summary = input.payments.terminationSummary;
  const endYmd =
    input.payments.contractEndedYmd ??
    (summary?.terminatedAt ? summary.terminatedAt.slice(0, 10) : null);
  const startYmd = summary?.activatedAt ? summary.activatedAt.slice(0, 10) : null;

  return {
    hirePeriodLabel: startYmd && endYmd ? formatUkDateRangeText(startYmd, endYmd) : "—",
    timeOnHireLabel: summary
      ? formatHireDurationWeeksAndDays(summary.durationDays)
      : "—",
  };
}

export function buildHireEndedSummaryStats(input: {
  dashboard: HireDashboardData;
  payments: HirePaymentsPageData;
  audience?: "staff" | "driver";
}) {
  const audience = input.audience ?? "staff";
  const summary = input.payments.terminationSummary;
  const depositAppliedGbp = summary ? hireDepositAppliedToRentGbp(summary) : 0;
  const rentSettledGbp = summary?.accruedRentDueGbp ?? input.dashboard.summary.totalDueGbp;
  const rentPaidGbp = summary?.accruedRentPaidGbp ?? input.dashboard.summary.totalPaidGbp;
  const driverChargesGbp = sumDriverChargesGbp(input.payments.driverChargeLineItems);
  const driverChargeCount = countBillableDriverCharges(input.payments.driverChargeLineItems);
  const ledger = summarizeHireSettlementLedger(input.payments.settlementBalancePayments);
  const refundPaidGbp = ledger.settlementPaidGbp;
  const refundPaymentCount = input.payments.settlementBalancePayments.filter(
    (payment) => payment.direction === "paid_to_driver",
  ).length;

  return {
    rentSettledGbp: roundGbp(rentSettledGbp),
    rentSettledHint: formatRentSettledHint(rentPaidGbp, depositAppliedGbp),
    driverChargesGbp,
    driverChargesHint: formatDriverChargesHint(driverChargeCount, audience),
    refundPaidGbp,
    refundPaidHint: formatRefundPaidHintForAudience(refundPaymentCount, audience),
    depositAppliedGbp,
    driverChargeCount,
  };
}

export function hireEndedSettlementChipLabel(
  payments: Pick<HirePaymentsPageData, "settlementBalance" | "depositPendingReview">,
): string | null {
  if (payments.depositPendingReview) return null;
  if (payments.settlementBalance?.settled) return "Settlement completed";
  if (payments.settlementBalance?.settlementDirection === "company_owes_driver") {
    return "Refund due";
  }
  if (payments.settlementBalance?.settlementDirection === "driver_owes_company") {
    return "Balance outstanding";
  }
  return null;
}
