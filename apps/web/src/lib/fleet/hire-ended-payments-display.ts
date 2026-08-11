import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  hireDepositAppliedToRentGbp,
  sumDriverChargesGbp,
} from "@/lib/fleet/hire-ended-summary-display";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";
import { hireProRataRentAdjustmentGbp } from "@/lib/fleet/hire-termination-summary";

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export type HireEndedRentCalculationDisplay = {
  rentDueToEndGbp: number;
  paymentReceivedDuringHireGbp: number;
  paidFromDepositGbp: number;
  rentOutstandingGbp: number;
  cancelledPeriodNote: string | null;
};

export function buildHireEndedRentCalculation(
  payments: Pick<HirePaymentsPageData, "terminationSummary" | "summary">,
): HireEndedRentCalculationDisplay {
  const termination = payments.terminationSummary;
  const rentDueToEndGbp = roundGbp(
    termination?.accruedRentDueGbp ?? payments.summary.totalDueGbp,
  );
  const paymentReceivedDuringHireGbp = roundGbp(
    termination?.accruedRentPaidGbp ?? payments.summary.totalPaidGbp,
  );
  const paidFromDepositGbp = termination ? hireDepositAppliedToRentGbp(termination) : 0;
  const rentOutstandingGbp = roundGbp(
    Math.max(0, rentDueToEndGbp - paymentReceivedDuringHireGbp - paidFromDepositGbp),
  );

  let cancelledPeriodNote: string | null = null;
  if (termination) {
    const cancelledGbp = hireProRataRentAdjustmentGbp({
      rentGrossAccruedGbp: payments.summary.rentGrossAccruedGbp,
      totalDiscountGbp: payments.summary.totalDiscountGbp,
      accruedRentDueGbp: termination.accruedRentDueGbp,
    });
    if (cancelledGbp > 0.005) {
      const periodWord =
        termination.rentCadence === "weekly"
          ? "week"
          : termination.rentCadence === "monthly"
            ? "month"
            : "day";
      cancelledPeriodNote = `${formatGbp(cancelledGbp)} of the final ${periodWord} was cancelled after early termination. It is not unpaid rent.`;
    }
  }

  return {
    rentDueToEndGbp,
    paymentReceivedDuringHireGbp,
    paidFromDepositGbp,
    rentOutstandingGbp,
    cancelledPeriodNote,
  };
}

export type HireEndedDepositRefundDisplay = {
  visible: boolean;
  originalDepositGbp: number;
  lessUnpaidRentGbp: number;
  lessDamageGbp: number;
  refundPaidToDriverGbp: number;
  refundPaidLabel: string;
  refundNote: string | null;
};

export function buildHireEndedDepositRefundDisplay(input: {
  payments: Pick<
    HirePaymentsPageData,
    "terminationSummary" | "depositGbp" | "settlementBalancePayments" | "driverChargeLineItems"
  >;
  audience?: "staff" | "driver";
}): HireEndedDepositRefundDisplay | null {
  const audience = input.audience ?? "staff";
  const depositGbp = roundGbp(
    input.payments.terminationSummary?.depositGbp ?? input.payments.depositGbp ?? 0,
  );
  if (depositGbp <= 0.005) return null;

  const lessUnpaidRentGbp = input.payments.terminationSummary
    ? hireDepositAppliedToRentGbp(input.payments.terminationSummary)
    : 0;
  const lessDamageGbp = sumDriverChargesGbp(input.payments.driverChargeLineItems);
  const ledger = summarizeHireSettlementLedger(input.payments.settlementBalancePayments);
  const refundPaidToDriverGbp = ledger.settlementPaidGbp;
  const refundPaymentCount = input.payments.settlementBalancePayments.filter(
    (payment) => payment.direction === "paid_to_driver",
  ).length;

  let refundNote: string | null = null;
  if (refundPaidToDriverGbp > 0.005 && refundPaymentCount > 0) {
    const noun = refundPaymentCount === 1 ? "bank transfer" : "bank transfers";
    refundNote =
      audience === "driver"
        ? `Your final refund was paid in full across ${refundPaymentCount} ${noun}.`
        : `Final refund paid in full across ${refundPaymentCount} ${noun}.`;
  } else if (refundPaidToDriverGbp <= 0.005 && lessUnpaidRentGbp + lessDamageGbp >= depositGbp - 0.005) {
    refundNote =
      audience === "driver"
        ? "Your deposit was fully applied to rent and charges — no refund remaining."
        : "Deposit was fully applied to rent and charges — no refund remaining.";
  }

  return {
    visible: true,
    originalDepositGbp: depositGbp,
    lessUnpaidRentGbp,
    lessDamageGbp,
    refundPaidToDriverGbp,
    refundPaidLabel: audience === "driver" ? "Refund paid to you" : "Refund paid to driver",
    refundNote,
  };
}

export type HireEndedPositionSnapshotDisplay = {
  rentDueGbp: number;
  rentPaidByDriverGbp: number;
  depositAppliedToRentGbp: number;
  refundDueBeforeLaterChargesGbp: number;
};

export function buildHireEndedPositionSnapshot(
  payments: Pick<HirePaymentsPageData, "terminationSummary" | "summary" | "depositGbp">,
): HireEndedPositionSnapshotDisplay | null {
  const termination = payments.terminationSummary;
  if (!termination) return null;

  const rentDueGbp = roundGbp(termination.accruedRentDueGbp);
  const rentPaidByDriverGbp = roundGbp(termination.accruedRentPaidGbp);
  const depositAppliedToRentGbp = hireDepositAppliedToRentGbp(termination);
  const depositGbp = roundGbp(termination.depositGbp || payments.depositGbp || 0);
  const refundDueBeforeLaterChargesGbp = roundGbp(
    Math.max(0, depositGbp - depositAppliedToRentGbp),
  );

  return {
    rentDueGbp,
    rentPaidByDriverGbp,
    depositAppliedToRentGbp,
    refundDueBeforeLaterChargesGbp,
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
