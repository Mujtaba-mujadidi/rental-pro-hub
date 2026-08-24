/**
 * Vehicle hire income for P&L (read-side, derived from schedule + balance ledger).
 *
 * Model:
 * - Rent collected on the schedule (approved amounts / staff-recorded payments), accrued
 *   through today or contract end, with termination proration on the final period.
 * - Plus settlement collections only when rent was collected via the balance ledger instead
 *   of the schedule (avoids double-counting schedule + settlement for the same rent).
 * - Plus deposit retention when staff forfeit or partially retain the deposit after contract end
 *   (deposit applied to rent at contract end counts as rent income, not deposit retention).
 * - Plus realised driver charges: charged-now cash and approved extra-charge receipts only.
 *   Unpaid extras remain receivables and are never booked as vehicle profit (even when settled).
 * - Minus settlement write-offs only (balance-ledger refunds return deposits/prepaid
 *   rent and are not contra-revenue when that rent was never recognised on the vehicle).
 */

import { isDepositDispositionPending } from "@/lib/fleet/hire-deposit-resolution";
import { depositRentScheduleCreditGbp } from "@/lib/fleet/hire-deposit-schedule-allocation";

import {
  hirePaymentRowPaidGbp,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { summarizeHireRentSettlement } from "@/lib/fleet/hire-rent-settlement";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import {
  partitionBalancePaymentsForIncome,
  realisedDriverChargeIncomeGbp,
  type HireDriverChargeLineItemInput,
  type HireDriverChargeType,
} from "@/lib/fleet/hire-driver-charges";
import {
  terminationRentDueForRow,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";

export type HireIncomeRow = {
  paymentStatus: string;
  approvedAmountGbp: number | null;
  baseAmountGbp: number;
  discountTotalGbp: number;
};

export type VehicleHireIncomeScheduleRow = HireIncomeRow & {
  hireGroupId: string;
  periodStart: string;
  periodEnd: string;
  rowKind: string;
};

export type HireIncomeGroupContext = {
  contractEndedYmd: string | null;
  rentCadence: RentCadence;
  rentBillingMode: HireTerminationRentBillingMode;
  settlementWriteOffGbp: number;
  depositDisposition: string | null;
  depositRefundAmountGbp: number | null;
  depositGbp: number;
  signedRentBalanceGbp: number | null;
  /** Persisted at contract end — preferred over raw schedule paid for ended hires. */
  accruedRentPaidGbp?: number | null;
  accruedRentDueGbp?: number | null;
  /**
   * Whether settlement is closed. Kept for callers; driver-charge income no longer
   * realises unpaid extras from this flag (cash receipts only).
   */
  settlementSettled?: boolean;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function netDue(row: HireIncomeRow): number {
  return Math.max(0, roundGbp(row.baseAmountGbp - row.discountTotalGbp));
}

function scheduleRowPaidGbp(row: HireIncomeRow): number {
  return hirePaymentRowPaidGbp(row as HirePaymentScheduleRowInput);
}

function toScheduleInput(row: VehicleHireIncomeScheduleRow): HirePaymentScheduleRowInput {
  return {
    id: row.hireGroupId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus as HirePaymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: null,
    sortOrder: 0,
  };
}

/** Earned in-contract rent for an ended hire (excludes prepaid future periods). */
export function endedHireRentIncomeGbp(input: {
  accruedRentPaidGbp: number;
  accruedRentDueGbp: number;
}): number {
  const paid = roundGbp(input.accruedRentPaidGbp);
  const due = roundGbp(input.accruedRentDueGbp);
  if (paid <= 0.005 || due <= 0.005) return 0;
  return roundGbp(Math.min(paid, due));
}

function groupRentRowsByHireGroupId(
  scheduleRows: readonly VehicleHireIncomeScheduleRow[],
): Map<string, VehicleHireIncomeScheduleRow[]> {
  const map = new Map<string, VehicleHireIncomeScheduleRow[]>();
  for (const row of scheduleRows) {
    if (!isRentRow(row)) continue;
    const list = map.get(row.hireGroupId) ?? [];
    list.push(row);
    map.set(row.hireGroupId, list);
  }
  return map;
}

function isRentRow(row: VehicleHireIncomeScheduleRow): boolean {
  return row.rowKind === "rent";
}

function rowAccruedRentDueGbp(
  row: VehicleHireIncomeScheduleRow,
  contractEndedYmd: string | null,
  todayYmd: string,
  groupContext: Pick<HireIncomeGroupContext, "rentCadence" | "rentBillingMode"> | null,
): number {
  const accrualYmd = hireIncomeAccrualYmd(contractEndedYmd, todayYmd);
  if (row.periodStart > accrualYmd) return 0;
  if (!contractEndedYmd || !groupContext) return netDue(row);

  const computedRow = {
    id: row.hireGroupId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: "rent" as const,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus as HirePaymentScheduleRowInput["paymentStatus"],
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: null,
    sortOrder: 0,
    netDueGbp: netDue(row),
    paidGbp: scheduleRowPaidGbp(row),
    balanceGbp: 0,
    accrued: true,
  };

  return terminationRentDueForRow(
    computedRow,
    contractEndedYmd,
    groupContext.rentBillingMode,
    groupContext.rentCadence,
  );
}

function recognizedRentIncomeGbp(
  row: VehicleHireIncomeScheduleRow,
  contractEndedYmd: string | null,
  todayYmd: string,
  groupContext: Pick<HireIncomeGroupContext, "rentCadence" | "rentBillingMode"> | null,
): number | null {
  const paid = scheduleRowPaidGbp(row);
  if (paid <= 0.005) return null;

  const accrualYmd = hireIncomeAccrualYmd(contractEndedYmd, todayYmd);
  if (row.periodStart > accrualYmd) return null;
  if (!contractEndedYmd || !groupContext) return roundGbp(paid);

  if (row.periodEnd <= contractEndedYmd) return roundGbp(paid);

  if (row.periodStart <= contractEndedYmd && contractEndedYmd < row.periodEnd) {
    const computedRow = {
      id: row.hireGroupId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      rowKind: "rent" as const,
      baseAmountGbp: row.baseAmountGbp,
      discountTotalGbp: row.discountTotalGbp,
      paymentStatus: row.paymentStatus as HirePaymentScheduleRowInput["paymentStatus"],
      approvedAmountGbp: row.approvedAmountGbp,
      pendingSubmittedGbp: null,
      sortOrder: 0,
      netDueGbp: netDue(row),
      paidGbp: paid,
      balanceGbp: 0,
      accrued: true,
    };
    const proratedDue = terminationRentDueForRow(
      computedRow,
      contractEndedYmd,
      groupContext.rentBillingMode,
      groupContext.rentCadence,
    );
    return roundGbp(Math.min(paid, proratedDue));
  }

  return roundGbp(paid);
}

export type HireRefundPaymentRow = {
  hireGroupId?: string | null;
  amountGbp: number;
  direction: string | null;
  paymentCategory?: string | null;
};

/** Contract end date for income accrual (termination date, else check-in end date). */
export function hireContractEndYmd(input: {
  status: string;
  terminatedAt: string | null;
  endedAt: string | null;
}): string | null {
  const status = String(input.status ?? "").trim();
  if (status !== "terminated" && status !== "completed") return null;
  return input.terminatedAt?.slice(0, 10) ?? input.endedAt?.slice(0, 10) ?? null;
}

/** Accrual cutoff: contract end when ended, otherwise today. */
export function hireIncomeAccrualYmd(contractEndedYmd: string | null, todayYmd: string): string {
  return contractEndedYmd ?? todayYmd;
}

/** Sum approved hire income for P&L (uses approved amount or net due). */
export function sumApprovedHireIncomeGbp(rows: HireIncomeRow[]): number {
  let total = 0;
  for (const row of rows) {
    const amount = scheduleRowPaidGbp(row);
    if (amount <= 0.005) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function isPostEndPrepaidHireIncomeRow(
  row: VehicleHireIncomeScheduleRow,
  contractEndedYmd: string | null | undefined,
): boolean {
  const endedYmd = contractEndedYmd?.trim();
  if (!endedYmd) return false;
  if (!isRentRow(row)) return false;
  if (row.periodStart <= endedYmd) return false;
  const amount = scheduleRowPaidGbp(row);
  return amount > 0.005;
}

export function sumHireRefundsToDriverGbp(payments: readonly HireRefundPaymentRow[]): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.direction !== "paid_to_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function sumHireCollectionsFromDriverGbp(payments: readonly HireRefundPaymentRow[]): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.direction !== "received_from_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function sumHireSettlementWriteOffsGbp(
  groups: readonly { settlementWriteOffGbp: number }[],
): number {
  let total = 0;
  for (const group of groups) {
    const amount = Number(group.settlementWriteOffGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

/** Deposit applied to outstanding rent at contract end (counts as rent income, not deposit retention). */
export function depositAppliedToRentIncomeGbp(input: {
  depositDisposition: string | null | undefined;
  depositGbp: number;
  signedRentBalanceGbp: number | null | undefined;
  depositRefundAmountGbp?: number | null;
  recognizedRentIncomeGbp: number;
  accruedRentDueGbp: number;
}): number {
  const disposition = String(input.depositDisposition ?? "").trim();
  if (disposition !== "apply_to_balance") return 0;

  const credit = depositRentScheduleCreditGbp({
    disposition,
    depositGbp: input.depositGbp,
    signedRentBalanceGbp: Math.max(0, Number(input.signedRentBalanceGbp ?? 0)),
    depositRefundAmountGbp: input.depositRefundAmountGbp,
  });
  const rentShortfall = roundGbp(
    Math.max(0, input.accruedRentDueGbp - input.recognizedRentIncomeGbp),
  );
  return roundGbp(Math.min(credit, rentShortfall));
}

/** Deposit retained by the company after disposition (forfeit, partial refund). */
export function depositRetentionIncomeGbp(input: {
  depositDisposition: string | null | undefined;
  depositGbp: number;
  depositRefundAmountGbp?: number | null;
  signedRentBalanceGbp?: number | null;
}): number {
  const disposition = String(input.depositDisposition ?? "").trim();
  const deposit = roundGbp(input.depositGbp);
  if (deposit <= 0.005) return 0;
  if (!disposition || isDepositDispositionPending(disposition) || disposition === "refund_full") return 0;

  if (disposition === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, Number(input.depositRefundAmountGbp ?? 0)));
    return roundGbp(deposit - refund);
  }

  if (disposition === "forfeit") {
    return deposit;
  }

  return 0;
}

export function supplementalSettlementRentCollectionsGbp(input: {
  accruedRentDueGbp: number;
  scheduleRentIncomeGbp: number;
  collectionsFromDriverGbp: number;
}): number {
  const uncollectedOnScheduleGbp = roundGbp(
    Math.max(0, input.accruedRentDueGbp - input.scheduleRentIncomeGbp),
  );
  return roundGbp(Math.min(input.collectionsFromDriverGbp, uncollectedOnScheduleGbp));
}

function realisedDriverChargeIncomeForVehicle(input: {
  charges: readonly HireDriverChargeLineItemInput[];
  receipts: readonly HireRefundPaymentRow[];
  groupContextByGroupId: ReadonlyMap<string, HireIncomeGroupContext>;
}): {
  totalGbp: number;
  byTypeGbp: Partial<Record<HireDriverChargeType, number>>;
} {
  const fallbackGroupId =
    input.groupContextByGroupId.size === 1 ? [...input.groupContextByGroupId.keys()][0]! : null;
  const chargesByGroupId = new Map<string, HireDriverChargeLineItemInput[]>();
  const receiptsByGroupId = new Map<string, HireRefundPaymentRow[]>();

  for (const item of input.charges) {
    const groupId = item.hireGroupId?.trim() || fallbackGroupId || "";
    const list = chargesByGroupId.get(groupId) ?? [];
    list.push(item);
    chargesByGroupId.set(groupId, list);
  }
  for (const payment of input.receipts) {
    const groupId = payment.hireGroupId?.trim() || fallbackGroupId || "";
    const list = receiptsByGroupId.get(groupId) ?? [];
    list.push(payment);
    receiptsByGroupId.set(groupId, list);
  }

  const groupIds = new Set([
    ...chargesByGroupId.keys(),
    ...receiptsByGroupId.keys(),
    ...input.groupContextByGroupId.keys(),
  ]);
  let totalGbp = 0;
  const byTypeGbp: Partial<Record<HireDriverChargeType, number>> = {};
  for (const groupId of groupIds) {
    const hireSettled = input.groupContextByGroupId.get(groupId)?.settlementSettled === true;
    const part = realisedDriverChargeIncomeGbp({
      charges: chargesByGroupId.get(groupId) ?? [],
      receipts: receiptsByGroupId.get(groupId) ?? [],
      hireSettled,
    });
    totalGbp += part.totalGbp;
    for (const [type, amount] of Object.entries(part.byTypeGbp) as [HireDriverChargeType, number][]) {
      byTypeGbp[type] = roundGbp((byTypeGbp[type] ?? 0) + amount);
    }
  }
  return { totalGbp: roundGbp(totalGbp), byTypeGbp };
}

export function computeVehicleHireIncomeGbp(input: {
  scheduleRows: readonly VehicleHireIncomeScheduleRow[];
  balancePayments: readonly HireRefundPaymentRow[];
  driverChargeLineItems?: readonly HireDriverChargeLineItemInput[];
  groupContextByGroupId: ReadonlyMap<string, HireIncomeGroupContext>;
  todayYmd: string;
}): {
  grossApprovedGbp: number;
  accruedRentDueGbp: number;
  supplementalCollectionsGbp: number;
  postEndPrepaidExcludedGbp: number;
  refundsToDriverGbp: number;
  collectionsFromDriverGbp: number;
  driverChargeIncomeGbp: number;
  driverChargeIncomeByTypeGbp: Partial<Record<HireDriverChargeType, number>>;
  settlementWriteOffsGbp: number;
  depositRetentionGbp: number;
  netIncomeGbp: number;
} {
  const rentRowsByGroupId = groupRentRowsByHireGroupId(input.scheduleRows);
  let scheduleRentIncomeGbp = 0;
  let depositRetentionGbp = 0;
  let accruedRentDueGbp = 0;
  let postEndPrepaidExcludedGbp = 0;
  const groupAccruedRentDueGbp = new Map<string, number>();
  const groupScheduleRentIncomeGbp = new Map<string, number>();

  const groupIds = new Set([
    ...input.groupContextByGroupId.keys(),
    ...rentRowsByGroupId.keys(),
  ]);

  for (const groupId of groupIds) {
    const groupContext = input.groupContextByGroupId.get(groupId) ?? null;
    const contractEndedYmd = groupContext?.contractEndedYmd ?? null;
    const rentRows = rentRowsByGroupId.get(groupId) ?? [];
    const scheduleInputs = rentRows.map(toScheduleInput);

    if (contractEndedYmd) {
      const settlement = summarizeHireRentSettlement(scheduleInputs, contractEndedYmd, {
        billingMode: groupContext?.rentBillingMode ?? "end_of_period",
        rentCadence: groupContext?.rentCadence ?? "weekly",
      });
      const accruedDueGbp =
        groupContext?.accruedRentDueGbp != null
          ? roundGbp(groupContext.accruedRentDueGbp)
          : settlement.accruedRentDueGbp;
      const accruedPaidGbp =
        groupContext?.accruedRentPaidGbp != null
          ? roundGbp(groupContext.accruedRentPaidGbp)
          : settlement.accruedRentPaidGbp;
      let groupIncome = endedHireRentIncomeGbp({
        accruedRentPaidGbp: accruedPaidGbp,
        accruedRentDueGbp: accruedDueGbp,
      });
      if (groupContext) {
        groupIncome = roundGbp(
          groupIncome +
            depositAppliedToRentIncomeGbp({
              depositDisposition: groupContext.depositDisposition,
              depositGbp: groupContext.depositGbp,
              signedRentBalanceGbp: groupContext.signedRentBalanceGbp,
              depositRefundAmountGbp: groupContext.depositRefundAmountGbp,
              recognizedRentIncomeGbp: groupIncome,
              accruedRentDueGbp: accruedDueGbp,
            }),
        );
      }
      scheduleRentIncomeGbp += groupIncome;
      accruedRentDueGbp += accruedDueGbp;
      postEndPrepaidExcludedGbp += settlement.prepaidRentCreditGbp;
      groupAccruedRentDueGbp.set(groupId, accruedDueGbp);
      groupScheduleRentIncomeGbp.set(groupId, groupIncome);
    } else {
      let groupDue = 0;
      let groupIncome = 0;
      for (const row of rentRows) {
        groupDue += rowAccruedRentDueGbp(
          row,
          contractEndedYmd,
          input.todayYmd,
          groupContext,
        );
        const amount = recognizedRentIncomeGbp(
          row,
          contractEndedYmd,
          input.todayYmd,
          groupContext,
        );
        if (amount == null) continue;
        groupIncome += amount;
      }
      scheduleRentIncomeGbp += groupIncome;
      accruedRentDueGbp += groupDue;
      groupAccruedRentDueGbp.set(groupId, groupDue);
      groupScheduleRentIncomeGbp.set(groupId, groupIncome);
    }

    if (groupContext) {
      depositRetentionGbp += depositRetentionIncomeGbp({
        depositDisposition: groupContext.depositDisposition,
        depositGbp: groupContext.depositGbp,
        depositRefundAmountGbp: groupContext.depositRefundAmountGbp,
        signedRentBalanceGbp: groupContext.signedRentBalanceGbp,
      });
    }
  }

  scheduleRentIncomeGbp = roundGbp(scheduleRentIncomeGbp);
  depositRetentionGbp = roundGbp(depositRetentionGbp);
  accruedRentDueGbp = roundGbp(accruedRentDueGbp);
  postEndPrepaidExcludedGbp = roundGbp(postEndPrepaidExcludedGbp);
  const { settlementPayments, driverChargePayments } = partitionBalancePaymentsForIncome(
    input.balancePayments,
  );
  const refundsToDriverGbp = sumHireRefundsToDriverGbp(settlementPayments);
  const collectionsFromDriverGbp = sumHireCollectionsFromDriverGbp(settlementPayments);
  const { totalGbp: driverChargeIncomeGbp, byTypeGbp: driverChargeIncomeByTypeGbp } =
    realisedDriverChargeIncomeForVehicle({
      charges: input.driverChargeLineItems ?? [],
      receipts: driverChargePayments,
      groupContextByGroupId: input.groupContextByGroupId,
    });

  const singleGroupFallback = groupIds.size === 1;
  let supplementalCollectionsGbp = 0;
  for (const groupId of groupIds) {
    const groupSettlementPayments = settlementPayments.filter((payment) => {
      if (payment.hireGroupId) return payment.hireGroupId === groupId;
      return singleGroupFallback;
    });
    supplementalCollectionsGbp += supplementalSettlementRentCollectionsGbp({
      accruedRentDueGbp: groupAccruedRentDueGbp.get(groupId) ?? 0,
      scheduleRentIncomeGbp: groupScheduleRentIncomeGbp.get(groupId) ?? 0,
      collectionsFromDriverGbp: sumHireCollectionsFromDriverGbp(groupSettlementPayments),
    });
  }
  supplementalCollectionsGbp = roundGbp(supplementalCollectionsGbp);
  const settlementWriteOffsGbp = roundGbp(
    [...input.groupContextByGroupId.values()].reduce(
      (sum, context) => sum + (context.settlementWriteOffGbp > 0 ? context.settlementWriteOffGbp : 0),
      0,
    ),
  );
  const netIncomeGbp = roundGbp(
    scheduleRentIncomeGbp +
      supplementalCollectionsGbp +
      depositRetentionGbp +
      driverChargeIncomeGbp -
      settlementWriteOffsGbp,
  );

  return {
    grossApprovedGbp: roundGbp(scheduleRentIncomeGbp + depositRetentionGbp + driverChargeIncomeGbp),
    accruedRentDueGbp,
    supplementalCollectionsGbp,
    postEndPrepaidExcludedGbp,
    refundsToDriverGbp,
    collectionsFromDriverGbp,
    driverChargeIncomeGbp,
    driverChargeIncomeByTypeGbp,
    settlementWriteOffsGbp,
    depositRetentionGbp,
    netIncomeGbp,
  };
}
