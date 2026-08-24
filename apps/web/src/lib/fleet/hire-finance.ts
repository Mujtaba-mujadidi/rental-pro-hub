/**
 * Single hire-finance calculation surface.
 *
 * Payments, end-hire, balances, and vehicle P&L should import from here (or read
 * `vehicle_hire_financial_summary` rebuilt after mutations).
 */

import {
  buildActiveHireAccountPosition,
  buildEndedHireAccountPosition,
} from "@/lib/fleet/hire-account-adapters";
import {
  hireAccountOpenAmountGbp,
  type HireAccountDirection,
  type HireAccountPosition,
} from "@/lib/fleet/hire-account-position";
import {
  buildExtraChargePaidByChargeId,
  buildExtraChargePaymentTableRows,
  buildExtraChargePaymentTableRowsFromWorkspace,
  outstandingExtraChargesFromTimedPaymentsGbp,
  resolveExtraChargeReceiptAllocationSlices,
  type ExtraChargePaymentDisplayStatus,
  type ExtraChargePaymentTableRow,
  type ExtraChargeReceiptAllocationSlice,
} from "@/lib/fleet/hire-driver-charge-payment";
import {
  outstandingExtraChargesGbp,
  realisedDriverChargeIncomeGbp,
  type HireBalancePaymentIncomeRow,
  type HireDriverChargeLineItemInput,
  type HireDriverChargeLineItemRow,
} from "@/lib/fleet/hire-driver-charges";
import {
  computeVehicleHireIncomeGbp,
  type HireIncomeGroupContext,
  type HireRefundPaymentRow,
  type VehicleHireIncomeScheduleRow,
} from "@/lib/fleet/hire-income";
import {
  enrichHirePaymentRows,
  summarizeHirePayments,
  type HirePaymentScheduleRowInput,
  type HirePaymentSummary,
} from "@/lib/fleet/hire-payment-summary";

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

export type HireExtraChargeCollectionStatus = ExtraChargePaymentDisplayStatus;

export type HireExtraChargeLineMoney = {
  chargeLineItemId: string;
  dueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  collectionStatus: HireExtraChargeCollectionStatus;
};

export type HireFinancialSummarySnapshot = {
  hireGroupId: string;
  parentCompanyId: string;
  vehicleId: string;
  rentDueGbp: number;
  rentPaidGbp: number;
  rentOutstandingGbp: number;
  extrasPostedGbp: number;
  extrasPaidGbp: number;
  extrasOutstandingGbp: number;
  scheduleRentIncomeGbp: number;
  driverChargeIncomeGbp: number;
  depositRetentionIncomeGbp: number;
  supplementalCollectionsGbp: number;
  settlementWriteOffsGbp: number;
  netHireIncomeGbp: number;
  openBalanceGbp: number;
  openDirection: HireAccountDirection;
  chargeLines: readonly HireExtraChargeLineMoney[];
  allocations: readonly ExtraChargeReceiptAllocationSlice[];
};

export {
  summarizeHirePayments as computeHireSchedulePaymentSummary,
  enrichHirePaymentRows as computeHireSchedulePaymentRows,
  buildExtraChargePaymentTableRows as computeHireExtraChargePaymentTableRows,
  buildExtraChargePaymentTableRowsFromWorkspace as computeHireExtraChargePaymentTableRowsFromWorkspace,
  realisedDriverChargeIncomeGbp as computeHireDriverChargeIncomeGbp,
  computeVehicleHireIncomeGbp as computeHireIncomeGbp,
  buildActiveHireAccountPosition as computeActiveHireAccountPosition,
  buildEndedHireAccountPosition as computeEndedHireAccountPosition,
  hireAccountOpenAmountGbp,
};

export type {
  HirePaymentSummary,
  HirePaymentScheduleRowInput,
  ExtraChargePaymentTableRow,
  HireAccountPosition,
  HireIncomeGroupContext,
  VehicleHireIncomeScheduleRow,
  HireRefundPaymentRow,
  HireDriverChargeLineItemRow,
  HireDriverChargeLineItemInput,
};

export function computeHireExtraChargesOutstandingGbp(input: {
  charges: readonly HireDriverChargeLineItemRow[];
  receipts?: readonly Pick<
    HireBalancePaymentIncomeRow,
    "amountGbp" | "direction" | "paymentCategory"
  >[];
  timedPayments?: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly { eventType: string; metadata: Record<string, unknown> | null }[];
}): number {
  if (input.timedPayments?.length) {
    return outstandingExtraChargesFromTimedPaymentsGbp({
      charges: input.charges,
      payments: input.timedPayments,
      allocationEvents: input.allocationEvents,
    });
  }
  return outstandingExtraChargesGbp(input.charges, input.receipts ?? []);
}

export function deriveExtraChargeCollectionStatus(input: {
  resolution: string;
  dueGbp: number;
  paidGbp: number;
}): HireExtraChargeCollectionStatus {
  if (input.resolution === "voided") return "voided";
  if (input.resolution === "waived") return "waived";
  const due = roundGbp(Math.max(0, input.dueGbp));
  const paid = roundGbp(Math.max(0, input.paidGbp));
  if (input.resolution === "paid_now" || due <= 0.005 || paid + 0.005 >= due) return "paid";
  if (paid > 0.005) return "partially_paid";
  return "due";
}

export function computeHireExtraChargeLineMoney(input: {
  charges: readonly HireDriverChargeLineItemRow[];
  timedPayments: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly { eventType: string; metadata: Record<string, unknown> | null }[];
}): {
  lines: HireExtraChargeLineMoney[];
  allocations: ExtraChargeReceiptAllocationSlice[];
  postedGbp: number;
  paidGbp: number;
  outstandingGbp: number;
} {
  const allocations = resolveExtraChargeReceiptAllocationSlices({
    charges: input.charges,
    payments: input.timedPayments,
    allocationEvents: input.allocationEvents,
  });
  const paidById = buildExtraChargePaidByChargeId({
    charges: input.charges,
    payments: input.timedPayments,
    allocationEvents: input.allocationEvents,
  });

  let postedGbp = 0;
  let paidGbp = 0;
  const lines: HireExtraChargeLineMoney[] = [];

  for (const charge of input.charges) {
    const dueGbp = roundGbp(charge.amountGbp);
    const isBillable = charge.resolution === "paid_now" || charge.resolution === "add_to_balance";
    if (isBillable) postedGbp = roundGbp(postedGbp + dueGbp);

    const paid = roundGbp(
      paidById.get(charge.id) ?? (charge.resolution === "paid_now" ? dueGbp : 0),
    );
    const balanceGbp =
      charge.resolution === "voided" || charge.resolution === "waived"
        ? 0
        : roundGbp(Math.max(0, dueGbp - paid));
    if (isBillable) paidGbp = roundGbp(paidGbp + Math.min(dueGbp, paid));

    lines.push({
      chargeLineItemId: charge.id,
      dueGbp,
      paidGbp: charge.resolution === "voided" || charge.resolution === "waived" ? 0 : paid,
      balanceGbp,
      collectionStatus: deriveExtraChargeCollectionStatus({
        resolution: charge.resolution,
        dueGbp,
        paidGbp: paid,
      }),
    });
  }

  return {
    lines,
    allocations,
    postedGbp: roundGbp(postedGbp),
    paidGbp: roundGbp(paidGbp),
    outstandingGbp: computeHireExtraChargesOutstandingGbp({
      charges: input.charges,
      timedPayments: input.timedPayments,
      allocationEvents: input.allocationEvents,
    }),
  };
}

export function buildHireFinancialSummarySnapshot(input: {
  hireGroupId: string;
  parentCompanyId: string;
  vehicleId: string;
  scheduleSummary: HirePaymentSummary;
  extras: ReturnType<typeof computeHireExtraChargeLineMoney>;
  income: ReturnType<typeof computeVehicleHireIncomeGbp>;
  accountPosition: HireAccountPosition;
}): HireFinancialSummarySnapshot {
  const scheduleRentIncomeGbp = roundGbp(
    input.income.netIncomeGbp -
      input.income.driverChargeIncomeGbp -
      input.income.depositRetentionGbp -
      input.income.supplementalCollectionsGbp +
      input.income.settlementWriteOffsGbp,
  );

  return {
    hireGroupId: input.hireGroupId,
    parentCompanyId: input.parentCompanyId,
    vehicleId: input.vehicleId,
    rentDueGbp: roundGbp(input.scheduleSummary.totalDueGbp),
    rentPaidGbp: roundGbp(input.scheduleSummary.totalPaidGbp),
    rentOutstandingGbp: roundGbp(input.scheduleSummary.balanceGbp),
    extrasPostedGbp: input.extras.postedGbp,
    extrasPaidGbp: input.extras.paidGbp,
    extrasOutstandingGbp: input.extras.outstandingGbp,
    scheduleRentIncomeGbp,
    driverChargeIncomeGbp: roundGbp(input.income.driverChargeIncomeGbp),
    depositRetentionIncomeGbp: roundGbp(input.income.depositRetentionGbp),
    supplementalCollectionsGbp: roundGbp(input.income.supplementalCollectionsGbp),
    settlementWriteOffsGbp: roundGbp(input.income.settlementWriteOffsGbp),
    netHireIncomeGbp: roundGbp(input.income.netIncomeGbp),
    openBalanceGbp: roundGbp(hireAccountOpenAmountGbp(input.accountPosition)),
    openDirection: input.accountPosition.accountDirection,
    chargeLines: input.extras.lines,
    allocations: input.extras.allocations,
  };
}
