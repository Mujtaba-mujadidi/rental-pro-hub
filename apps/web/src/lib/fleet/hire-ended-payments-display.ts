import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { buildEndedHireAccountPosition } from "@/lib/fleet/hire-account-adapters";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  hireDepositAppliedToRentGbp,
  sumDriverChargesGbp,
} from "@/lib/fleet/hire-ended-summary-display";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";
import { hireRentTerminationAdjustmentDisplay, type HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";
import { roundGbp } from "@/lib/fleet/hire-money";

/** Unused rent paid for periods after the end date, plus overpayment on accrued rent. */
export function hireAdvanceRentToRefundGbp(
  summary:
    | Pick<HireTerminationAccountsSummary, "prepaidRentCreditGbp" | "accruedOverpaymentGbp">
    | null
    | undefined,
): number {
  if (!summary) return 0;
  return roundGbp(Math.max(0, summary.prepaidRentCreditGbp) + Math.max(0, summary.accruedOverpaymentGbp));
}

function splitSettlementRefundsToDriver(advanceRentToRefundGbp: number, settlementPaidGbp: number): {
  advanceRentRefundedGbp: number;
  depositRefundedGbp: number;
} {
  const paid = roundGbp(Math.max(0, settlementPaidGbp));
  const advanceRentRefundedGbp = roundGbp(Math.min(advanceRentToRefundGbp, paid));
  return {
    advanceRentRefundedGbp,
    depositRefundedGbp: roundGbp(Math.max(0, paid - advanceRentRefundedGbp)),
  };
}

export type HireEndedRentCalculationDisplay = {
  rentDueToEndGbp: number;
  totalRentReceivedDuringHireGbp: number;
  paymentReceivedDuringHireGbp: number;
  paidFromDepositGbp: number;
  rentOutstandingGbp: number;
  advanceRentToRefundGbp: number;
  advanceRentNote: string | null;
  cancelledPeriodNote: string | null;
};

export function buildHireEndedRentCalculation(
  payments: Pick<
    HirePaymentsPageData,
    "terminationSummary" | "summary" | "depositDisposition" | "depositReceivedGbp"
  >,
  options?: { audience?: "staff" | "driver" },
): HireEndedRentCalculationDisplay {
  const audience = options?.audience ?? "staff";
  const termination = payments.terminationSummary;
  const advanceRentToRefundGbp = hireAdvanceRentToRefundGbp(termination);

  if (termination) {
    const account = buildEndedHireAccountPosition({
      terminationSummary: termination,
      depositDisposition: payments.depositDisposition,
      depositReceivedGbp: payments.depositReceivedGbp ?? 0,
      extraChargesOutstandingGbp: 0,
      lifecycle: "ended",
    });
    const rentDueToEndGbp = account.rentChargedGbp;
    const paymentReceivedDuringHireGbp = account.rentPaidGbp;
    const paidFromDepositGbp = account.depositAppliedToRentGbp;
    const rentOutstandingGbp = account.rentOutstandingGbp;
    const totalRentReceivedDuringHireGbp = roundGbp(
      paymentReceivedDuringHireGbp + advanceRentToRefundGbp,
    );

    const adjustmentDisplay = hireRentTerminationAdjustmentDisplay({
      rentCadence: termination.rentCadence,
      rentBillingMode: termination.rentBillingMode,
      billingPeriodBreakdown: termination.billingPeriodBreakdown,
      rentGrossAccruedGbp: payments.summary.rentGrossAccruedGbp,
      totalDiscountGbp: payments.summary.totalDiscountGbp,
      accruedRentDueGbp: termination.accruedRentDueGbp,
    });
    const cancelledPeriodNote = adjustmentDisplay?.footnote ?? null;

    let advanceRentNote: string | null = null;
    if (advanceRentToRefundGbp > 0.005) {
      advanceRentNote =
        audience === "driver"
          ? `You also paid ${formatGbp(advanceRentToRefundGbp)} in advance for later rent periods. Unused advance rent is on the refund card.`
          : `The driver also paid ${formatGbp(advanceRentToRefundGbp)} in advance for later rent periods. Unused advance rent is on the refund card.`;
    }

    return {
      rentDueToEndGbp,
      totalRentReceivedDuringHireGbp,
      paymentReceivedDuringHireGbp,
      paidFromDepositGbp,
      rentOutstandingGbp,
      advanceRentToRefundGbp,
      advanceRentNote,
      cancelledPeriodNote,
    };
  }

  const rentDueToEndGbp = roundGbp(payments.summary.totalDueGbp);
  const paymentReceivedDuringHireGbp = roundGbp(payments.summary.totalPaidGbp);
  return {
    rentDueToEndGbp,
    totalRentReceivedDuringHireGbp: paymentReceivedDuringHireGbp,
    paymentReceivedDuringHireGbp,
    paidFromDepositGbp: 0,
    rentOutstandingGbp: roundGbp(Math.max(0, rentDueToEndGbp - paymentReceivedDuringHireGbp)),
    advanceRentToRefundGbp: 0,
    advanceRentNote: null,
    cancelledPeriodNote: null,
  };
}

export type HireEndedDepositRefundDisplay = {
  visible: boolean;
  heading: string;
  intro: string;
  originalDepositGbp: number;
  advanceRentToRefundGbp: number;
  lessUnpaidRentGbp: number;
  lessDamageGbp: number;
  advanceRentRefundedGbp: number;
  depositRefundedGbp: number;
  refundPaidToDriverGbp: number;
  refundPaidLabel: string;
  refundNote: string | null;
};

export function buildHireEndedDepositRefundDisplay(input: {
  payments: Pick<
    HirePaymentsPageData,
    | "terminationSummary"
    | "depositGbp"
    | "depositDisposition"
    | "depositReceivedGbp"
    | "settlementBalancePayments"
    | "driverChargeLineItems"
  >;
  audience?: "staff" | "driver";
}): HireEndedDepositRefundDisplay | null {
  const audience = input.audience ?? "staff";
  // Only received deposit money can be refunded or applied. Contractual unpaid deposit
  // has no end-of-hire refund/collect impact.
  const depositReceivedGbp = roundGbp(
    input.payments.depositReceivedGbp ??
      // Legacy callers without depositReceivedGbp: do not invent receipt from contractual amount.
      0,
  );
  const advanceRentToRefundGbp = hireAdvanceRentToRefundGbp(input.payments.terminationSummary);
  if (depositReceivedGbp <= 0.005 && advanceRentToRefundGbp <= 0.005) return null;

  const depositGbp = depositReceivedGbp;
  const lessUnpaidRentGbp = input.payments.terminationSummary
    ? hireDepositAppliedToRentGbp(
        input.payments.terminationSummary,
        input.payments.depositDisposition,
        depositReceivedGbp,
      )
    : 0;
  const lessDamageGbp = sumDriverChargesGbp(input.payments.driverChargeLineItems);
  const ledger = summarizeHireSettlementLedger(input.payments.settlementBalancePayments);
  const refundPaidToDriverGbp = ledger.settlementPaidGbp;
  const { advanceRentRefundedGbp, depositRefundedGbp } = splitSettlementRefundsToDriver(
    advanceRentToRefundGbp,
    refundPaidToDriverGbp,
  );
  const refundPaymentCount = input.payments.settlementBalancePayments.filter(
    (payment) => payment.direction === "paid_to_driver",
  ).length;

  const heading =
    depositGbp > 0.005 ? "Deposit and refund" : audience === "driver" ? "Advance rent refund" : "Advance rent refund";
  const intro =
    depositGbp > 0.005 && advanceRentToRefundGbp > 0.005
      ? audience === "driver"
        ? `How your ${formatGbp(depositGbp)} deposit and unused advance rent were settled.`
        : `How the ${formatGbp(depositGbp)} deposit and unused advance rent were settled.`
      : depositGbp > 0.005
        ? audience === "driver"
          ? `How your ${formatGbp(depositGbp)} deposit was settled.`
          : `How the ${formatGbp(depositGbp)} deposit was settled.`
        : audience === "driver"
          ? "Unused rent you paid in advance."
          : "Unused rent the driver paid in advance.";

  const noteParts: string[] = [];
  if (advanceRentRefundedGbp > 0.005) {
    const noun = refundPaymentCount === 1 ? "bank transfer" : "bank transfers";
    noteParts.push(
      audience === "driver"
        ? `${formatGbp(advanceRentRefundedGbp)} unused advance rent was refunded${refundPaymentCount > 0 ? ` across ${refundPaymentCount} ${noun}` : ""}.`
        : `${formatGbp(advanceRentRefundedGbp)} unused advance rent was refunded${refundPaymentCount > 0 ? ` across ${refundPaymentCount} ${noun}` : ""}.`,
    );
  }
  if (depositRefundedGbp > 0.005) {
    noteParts.push(
      audience === "driver"
        ? `${formatGbp(depositRefundedGbp)} of your deposit was refunded.`
        : `${formatGbp(depositRefundedGbp)} of the deposit was refunded.`,
    );
  }
  if (
    noteParts.length === 0 &&
    refundPaidToDriverGbp <= 0.005 &&
    lessUnpaidRentGbp + lessDamageGbp >= depositGbp - 0.005 &&
    depositGbp > 0.005
  ) {
    noteParts.push(
      audience === "driver"
        ? "Your deposit was fully applied to rent and charges — no deposit refund remaining."
        : "Deposit was fully applied to rent and charges — no deposit refund remaining.",
    );
  }

  return {
    visible: true,
    heading,
    intro,
    originalDepositGbp: depositGbp,
    advanceRentToRefundGbp,
    lessUnpaidRentGbp,
    lessDamageGbp,
    advanceRentRefundedGbp,
    depositRefundedGbp,
    refundPaidToDriverGbp,
    refundPaidLabel: audience === "driver" ? "Total refunded to you" : "Total refunded to driver",
    refundNote: noteParts.length ? noteParts.join(" ") : null,
  };
}

export type HireEndedPositionSnapshotDisplay = {
  rentDueGbp: number;
  totalRentReceivedDuringHireGbp: number;
  rentAppliedGbp: number;
  advanceRentToRefundGbp: number;
  depositHeldGbp: number;
  depositAppliedToRentGbp: number;
  note: string;
};

export function buildHireEndedPositionSnapshot(
  payments: Pick<
    HirePaymentsPageData,
    "terminationSummary" | "summary" | "depositGbp" | "depositDisposition" | "depositReceivedGbp"
  >,
  options?: { audience?: "staff" | "driver" },
): HireEndedPositionSnapshotDisplay | null {
  const termination = payments.terminationSummary;
  if (!termination) return null;

  const audience = options?.audience ?? "staff";
  const rent = buildHireEndedRentCalculation(payments, { audience });
  const depositReceivedGbp = roundGbp(payments.depositReceivedGbp ?? 0);
  const depositHeldGbp = roundGbp(
    Math.max(0, depositReceivedGbp - rent.paidFromDepositGbp),
  );

  const noteParts: string[] = [
    "This is the position at the end date, before later damage or settlement payments.",
  ];
  if (rent.advanceRentToRefundGbp > 0.005 && depositHeldGbp > 0.005) {
    noteParts.push(
      audience === "driver"
        ? `${formatGbp(rent.advanceRentToRefundGbp)} unused advance rent was due back separately from the ${formatGbp(depositHeldGbp)} deposit still held.`
        : `${formatGbp(rent.advanceRentToRefundGbp)} unused advance rent was due back separately from the ${formatGbp(depositHeldGbp)} deposit still held.`,
    );
  } else if (rent.advanceRentToRefundGbp > 0.005) {
    noteParts.push(
      `${formatGbp(rent.advanceRentToRefundGbp)} unused advance rent was due back.`,
    );
  } else if (depositHeldGbp > 0.005) {
    noteParts.push(
      audience === "driver"
        ? `${formatGbp(depositHeldGbp)} deposit was still held and is not a rent refund.`
        : `${formatGbp(depositHeldGbp)} deposit was still held and is not a rent refund.`,
    );
  }

  return {
    rentDueGbp: rent.rentDueToEndGbp,
    totalRentReceivedDuringHireGbp: rent.totalRentReceivedDuringHireGbp,
    rentAppliedGbp: rent.paymentReceivedDuringHireGbp,
    advanceRentToRefundGbp: rent.advanceRentToRefundGbp,
    depositHeldGbp,
    depositAppliedToRentGbp: rent.paidFromDepositGbp,
    note: noteParts.join(" "),
  };
}

export function formatEndedChargeEvidenceHref(
  hireGroupId: string,
  item: Pick<HireDriverChargeWorkspaceRow, "chargeType">,
  audience: "staff" | "driver" = "staff",
): string | null {
  if (item.chargeType === "checkin_inspection_damage" || item.chargeType.includes("damage")) {
    return audience === "driver"
      ? `/driver/hires/${hireGroupId}/checkin`
      : `/rental/hires/${hireGroupId}/checkin`;
  }
  return null;
}

export type HireEndedChargeCardDisplay = {
  title: string;
  severityLabel: string | null;
};

/** Prefer human title like "Rear bumper scratch" from stored `panel · type · severity`. */
export function formatEndedChargeCardDisplay(
  item: Pick<HireDriverChargeWorkspaceRow, "description" | "chargeTypeLabel">,
): HireEndedChargeCardDisplay {
  const raw = item.description?.trim() ?? "";
  const parts = raw.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const [panel, damageType, severity] = parts;
    const severityLabel = severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : null;
    return {
      title: `${panel} ${damageType}`.trim(),
      severityLabel,
    };
  }
  return {
    title: raw || item.chargeTypeLabel,
    severityLabel: null,
  };
}
