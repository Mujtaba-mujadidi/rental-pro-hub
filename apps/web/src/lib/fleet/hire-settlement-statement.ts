import { formatGbp } from "@/lib/fleet/maintenance";
import { buildHireAccountPosition } from "@/lib/fleet/hire-account-position";
import { roundGbp } from "@/lib/fleet/hire-money";
import { signedSettlementBalanceGbp } from "@/lib/fleet/hire-open-balance";
import {
  hireSettlementChargeActivityTitle,
  hireSettlementPaymentActivityDetail,
} from "@/lib/fleet/hire-settlement-balance-display";

export type HireSettlementStatementChargeInput = {
  id: string;
  chargedOn: string | null;
  createdAt: string;
  chargeType: string;
  description: string | null;
  amountGbp: number;
  resolution: string;
};

export type HireSettlementStatementPaymentInput = {
  id: string;
  paidAt: string;
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
};

export type HireSettlementLedgerKind = "charge" | "payment";

export type HireSettlementLedgerRow = {
  id: string;
  kind: HireSettlementLedgerKind;
  sortAt: string;
  dateYmd: string;
  occurredAt: string;
  activity: string;
  activityTitle: string;
  activityDetail: string | null;
  status: "approved" | "posted";
  typeLabel: string;
  signedAmountGbp: number;
  runningBalanceGbp: number;
  chargeId?: string;
  paymentId?: string;
  canMutateCharge?: boolean;
};

export type HireSettlementStatementKpis = {
  totalChargesGbp: number;
  approvedPaymentsGbp: number;
  refundsToDriverGbp: number;
  pendingPaymentsGbp: number;
  currentBalanceGbp: number;
  currentDirection: "driver_owes_company" | "company_owes_driver" | "settled";
};

export type HireSettlementStatement = {
  kpis: HireSettlementStatementKpis;
  rows: HireSettlementLedgerRow[];
};

function calendarDayFromInstant(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? value.trim();
}

function paymentTypeLabel(payment: HireSettlementStatementPaymentInput): string {
  if (payment.direction === "paid_to_driver") return "Refund";
  return "Received";
}

export function hireSettlementOpeningActivity(netSettlementGbp: number): {
  title: string;
  typeLabel: string;
} {
  if (netSettlementGbp < -0.005) {
    return { title: "Company owed driver at contract end", typeLabel: "Refund due" };
  }
  if (netSettlementGbp > 0.005) {
    return { title: "Driver owed company at contract end", typeLabel: "Amount due" };
  }
  return { title: "Settled at contract end", typeLabel: "Posted" };
}

export type HireSettlementRentScheduleRow = {
  id: string;
  rowKind: string;
  periodStart: string;
  accrued: boolean;
  netDueGbp: number;
  paidGbp: number;
  discountTotalGbp: number;
};

/** Accrued rent (after discount) plus approved rent receipts for an active hire balance page. */
export function hireActiveRentToSettlementEntries(
  rows: readonly HireSettlementRentScheduleRow[],
): {
  charges: HireSettlementStatementChargeInput[];
  payments: HireSettlementStatementPaymentInput[];
} {
  const charges: HireSettlementStatementChargeInput[] = [];
  const payments: HireSettlementStatementPaymentInput[] = [];
  for (const row of rows) {
    if (row.rowKind !== "rent" || !row.accrued) continue;
    const net = roundGbp(row.netDueGbp);
    const discount = roundGbp(row.discountTotalGbp);
    if (net > 0.005) {
      charges.push({
        id: `rent:${row.id}`,
        chargedOn: row.periodStart,
        createdAt: `${row.periodStart}T00:00:00.000Z`,
        chargeType: "rent",
        description: discount > 0.005 ? `After ${formatGbp(discount)} discount` : null,
        amountGbp: net,
        resolution: "add_to_balance",
      });
    }
    const paid = roundGbp(row.paidGbp);
    if (paid > 0.005) {
      payments.push({
        id: `rent-paid:${row.id}`,
        paidAt: `${row.periodStart}T00:00:00.000Z`,
        amountGbp: paid,
        direction: "received_from_driver",
        paymentCategory: "rent",
      });
    }
  }
  return { charges, payments };
}

export function activeHireSettlementOpenBalance(
  rentOutstandingGbp: number,
  extrasOutstandingGbp: number,
): {
  openBalanceGbp: number;
  openDirection: "driver_owes_company" | "settled";
} {
  const position = buildHireAccountPosition({
    lifecycle: "active",
    depositRequiredGbp: 0,
    depositReceivedGbp: 0,
    rentGrossChargedGbp: Math.max(0, rentOutstandingGbp),
    rentDiscountGbp: 0,
    rentPaidConfirmedGbp: 0,
    extraChargesPostedGbp: Math.max(0, extrasOutstandingGbp),
    extraChargePaymentsConfirmedGbp: 0,
  });
  return {
    openBalanceGbp: position.amountDriverOwesCompanyGbp,
    openDirection:
      position.accountDirection === "driver_owes_company" ? "driver_owes_company" : "settled",
  };
}

/**
 * Posted settlement ledger. Running balance is driver-owes-company positive.
 * Pending schedule submissions are KPI-only and do not move the running balance.
 */
export function buildHireSettlementStatement(input: {
  openingNetSettlementGbp: number;
  openingDateYmd: string | null;
  charges: readonly HireSettlementStatementChargeInput[];
  payments: readonly HireSettlementStatementPaymentInput[];
  pendingScheduleGbp: number;
  currentDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  currentOpenBalanceGbp: number;
  mutableChargeIds?: ReadonlySet<string>;
  openingActivityTitle?: string;
  openingActivityDetail?: string | null;
}): HireSettlementStatement {
  type Draft = Omit<HireSettlementLedgerRow, "runningBalanceGbp">;
  const drafts: Draft[] = [];
  const opening = roundGbp(input.openingNetSettlementGbp);
  if (Math.abs(opening) > 0.005) {
    const openingDate = input.openingDateYmd ?? "1970-01-01";
    const openingCopy = hireSettlementOpeningActivity(opening);
    const openingTitle = input.openingActivityTitle?.trim() || openingCopy.title;
    drafts.push({
      id: "opening-settlement",
      kind: "charge",
      sortAt: `${openingDate}T00:00:00.000Z`,
      dateYmd: openingDate,
      occurredAt: openingDate,
      activity: openingTitle,
      activityTitle: openingTitle,
      activityDetail: input.openingActivityDetail?.trim() || null,
      status: "posted",
      typeLabel: openingCopy.typeLabel,
      signedAmountGbp: opening,
    });
  }

  for (const charge of input.charges) {
    if (charge.resolution !== "add_to_balance" && charge.resolution !== "paid_now") continue;
    const amount = roundGbp(charge.amountGbp);
    if (amount <= 0.005) continue;
    const dateYmd = charge.chargedOn || calendarDayFromInstant(charge.createdAt);
    const activityTitle = hireSettlementChargeActivityTitle(charge.chargeType);
    const activityDetail = charge.description?.trim() || null;
    drafts.push({
      id: `charge:${charge.id}`,
      kind: "charge",
      sortAt: charge.createdAt || `${dateYmd}T00:00:00.000Z`,
      dateYmd,
      occurredAt: charge.createdAt || dateYmd,
      activity: activityTitle,
      activityTitle,
      activityDetail,
      status: "posted",
      typeLabel: "Posted",
      signedAmountGbp: amount,
      chargeId: charge.id,
      canMutateCharge: input.mutableChargeIds?.has(charge.id) === true,
    });
  }

  for (const payment of input.payments) {
    const amount = roundGbp(payment.amountGbp);
    if (amount <= 0.005) continue;
    const dateYmd = calendarDayFromInstant(payment.paidAt);
    const activityTitle =
      payment.direction === "paid_to_driver"
        ? "Refund to driver"
        : payment.paymentCategory === "rent"
          ? "Hire rent payment"
          : payment.paymentCategory === "driver_charge"
            ? "Extra charge payment"
            : "Payment from driver";
    const activityDetail = hireSettlementPaymentActivityDetail({
      notes: payment.notes,
      paymentReference: payment.paymentReference,
      paymentCategory: payment.paymentCategory,
      paymentMethod: payment.paymentMethod,
    });
    drafts.push({
      id: `payment:${payment.id}`,
      kind: "payment",
      sortAt: payment.paidAt,
      dateYmd,
      occurredAt: payment.paidAt,
      activity: activityTitle,
      activityTitle,
      activityDetail,
      status: "approved",
      typeLabel: paymentTypeLabel(payment),
      signedAmountGbp:
        payment.direction === "received_from_driver" ? roundGbp(-amount) : amount,
      paymentId: payment.id,
    });
  }

  drafts.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return a.sortAt.localeCompare(b.sortAt);
    if (a.kind !== b.kind) return a.kind === "charge" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  let running = 0;
  let totalChargesGbp = 0;
  let approvedPaymentsGbp = 0;
  let refundsToDriverGbp = 0;
  const rows: HireSettlementLedgerRow[] = drafts.map((row) => {
    running = roundGbp(running + row.signedAmountGbp);
    if (row.kind === "charge" && row.signedAmountGbp > 0.005) {
      totalChargesGbp = roundGbp(totalChargesGbp + row.signedAmountGbp);
    }
    if (row.kind === "payment" && row.signedAmountGbp < -0.005) {
      approvedPaymentsGbp = roundGbp(approvedPaymentsGbp + Math.abs(row.signedAmountGbp));
    }
    if (row.kind === "payment" && row.signedAmountGbp > 0.005) {
      refundsToDriverGbp = roundGbp(refundsToDriverGbp + row.signedAmountGbp);
    }
    return { ...row, runningBalanceGbp: running };
  });

  const currentSigned = signedSettlementBalanceGbp(
    input.currentDirection,
    input.currentOpenBalanceGbp,
  );
  const pendingPaymentsGbp = roundGbp(Math.max(0, input.pendingScheduleGbp));

  return {
    kpis: {
      totalChargesGbp: roundGbp(totalChargesGbp),
      approvedPaymentsGbp: roundGbp(approvedPaymentsGbp),
      refundsToDriverGbp: roundGbp(refundsToDriverGbp),
      pendingPaymentsGbp,
      currentBalanceGbp: roundGbp(Math.abs(currentSigned)),
      currentDirection: input.currentDirection,
    },
    rows,
  };
}

export function hireSettlementKpiCurrentLabel(kpis: HireSettlementStatementKpis): string {
  if (kpis.currentDirection === "settled" || kpis.currentBalanceGbp <= 0.005) {
    return "All clear";
  }
  if (kpis.currentDirection === "company_owes_driver") {
    return `${formatGbp(kpis.currentBalanceGbp)} to refund`;
  }
  return formatGbp(kpis.currentBalanceGbp);
}
