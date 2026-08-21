import { hireTableStatusToneClass, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import {
  hireDriverChargeTypeLabel,
  type HireBalancePaymentIncomeRow,
  type HireDriverChargeLineItemRow,
} from "@/lib/fleet/hire-driver-charges";

export const EXTRA_CHARGE_PAYMENT_EVENT_TYPES = [
  "driver_charge_payment_submitted",
  "driver_charge_payment_approved",
  "driver_charge_payment_rejected",
] as const;

export type ExtraChargePaymentEventType = (typeof EXTRA_CHARGE_PAYMENT_EVENT_TYPES)[number];

export type ExtraChargePaymentEventInput = {
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  summary?: string | null;
};

export type OpenExtraChargePayment = {
  submissionId: string;
  amountGbp: number;
  paymentReference: string | null;
  submittedAt: string;
};

export type ExtraChargePaymentDisplayStatus =
  | "paid"
  | "partially_paid"
  | "pending_approval"
  | "due"
  | "waived"
  | "voided";

export type ExtraChargePaymentTableRow = {
  id: string;
  periodLabel: string;
  chargeTypeLabel: string;
  description: string | null;
  chargedOn: string | null;
  /** Original posted amount (Scheduled column). */
  dueGbp: number;
  /** Void reduces charged amount; mirrors rent Adjustment. */
  adjustmentGbp: number;
  chargedGbp: number;
  paidGbp: number;
  balanceGbp: number;
  status: ExtraChargePaymentDisplayStatus;
  statusLabel: string;
  statusTone: HireTableStatusTone;
  canMutate: boolean;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isExtraChargePaymentEventType(value: string): value is ExtraChargePaymentEventType {
  return (EXTRA_CHARGE_PAYMENT_EVENT_TYPES as readonly string[]).includes(value);
}

function textFromMetadata(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function amountFromMetadata(metadata: Record<string, unknown> | null, key: string): number | null {
  const amount = Number(metadata?.[key]);
  return Number.isFinite(amount) && amount > 0 ? roundGbp(amount) : null;
}

/** Latest extra-charge payment still waiting for staff review. */
export function resolveOpenExtraChargePayment(
  events: readonly ExtraChargePaymentEventInput[],
): OpenExtraChargePayment | null {
  const latestBySubmission = new Map<
    string,
    { status: ExtraChargePaymentEventType; submittedAt: string; amountGbp: number; paymentReference: string | null }
  >();

  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const event of ordered) {
    if (!isExtraChargePaymentEventType(event.eventType)) continue;
    const submissionId = textFromMetadata(event.metadata, "submissionId");
    const amountGbp = amountFromMetadata(event.metadata, "amountGbp");
    if (!submissionId || amountGbp == null) continue;
    const existing = latestBySubmission.get(submissionId);
    latestBySubmission.set(submissionId, {
      status: event.eventType,
      submittedAt: existing?.submittedAt ?? event.createdAt,
      amountGbp: existing?.amountGbp ?? amountGbp,
      paymentReference:
        textFromMetadata(event.metadata, "paymentReference") ?? existing?.paymentReference ?? null,
    });
  }

  const open: OpenExtraChargePayment[] = [];
  for (const [submissionId, item] of latestBySubmission) {
    if (item.status !== "driver_charge_payment_submitted") continue;
    open.push({
      submissionId,
      amountGbp: item.amountGbp,
      paymentReference: item.paymentReference,
      submittedAt: item.submittedAt,
    });
  }
  open.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return open[0] ?? null;
}

export function extraChargePaymentStatusMeta(
  status: ExtraChargePaymentDisplayStatus,
): { label: string; tone: HireTableStatusTone } {
  if (status === "paid") return { label: "Paid", tone: "success" };
  if (status === "partially_paid") return { label: "Partially paid", tone: "warning" };
  if (status === "pending_approval") return { label: "Pending approval", tone: "pending" };
  if (status === "waived") return { label: "No charge", tone: "neutral" };
  if (status === "voided") return { label: "Voided", tone: "neutral" };
  return { label: "Due", tone: "warning" };
}

export function extraChargePaymentStatusClass(tone: HireTableStatusTone): string {
  return hireTableStatusToneClass(tone);
}

export type ExtraChargePaymentAllocationLine = {
  rowId: string;
  label: string;
  allocatedGbp: number;
  rowBalanceBeforeGbp: number;
  rowBalanceAfterGbp: number;
  fullyAllocated: boolean;
};

export type ExtraChargePaymentAllocationResult = {
  allocations: ExtraChargePaymentAllocationLine[];
  unallocatedGbp: number;
  totalOutstandingGbp: number;
};

export type ExtraChargePaymentAllocationRow = Pick<
  ExtraChargePaymentTableRow,
  "id" | "periodLabel" | "chargeTypeLabel" | "description" | "balanceGbp" | "status"
>;

export function extraChargeAllocationLabel(
  row: Pick<ExtraChargePaymentAllocationRow, "periodLabel" | "chargeTypeLabel" | "description">,
): string {
  const title = row.chargeTypeLabel || row.periodLabel;
  const detail = row.description?.trim();
  return detail ? `${title} · ${detail}` : title;
}

/**
 * Pour a payment across outstanding extra-charge lines, oldest first (same FIFO as rent).
 * Paid, waived, and pending-approval lines are skipped.
 */
export function allocateExtraChargePaymentAcrossRows(
  paymentAmountGbp: number,
  rows: readonly ExtraChargePaymentAllocationRow[],
): ExtraChargePaymentAllocationResult {
  const amount = roundGbp(Math.max(0, paymentAmountGbp));
  const eligible = rows.filter(
    (row) =>
      row.balanceGbp > 0.005 &&
      row.status !== "paid" &&
      row.status !== "waived" &&
      row.status !== "voided" &&
      row.status !== "pending_approval",
  );

  let remaining = amount;
  const allocations: ExtraChargePaymentAllocationLine[] = [];
  let totalOutstandingGbp = 0;

  for (const row of eligible) {
    totalOutstandingGbp = roundGbp(totalOutstandingGbp + row.balanceGbp);
    if (remaining <= 0.005) continue;

    const allocatedGbp = roundGbp(Math.min(remaining, row.balanceGbp));
    remaining = roundGbp(remaining - allocatedGbp);
    const rowBalanceAfterGbp = roundGbp(row.balanceGbp - allocatedGbp);
    allocations.push({
      rowId: row.id,
      label: extraChargeAllocationLabel(row),
      allocatedGbp,
      rowBalanceBeforeGbp: roundGbp(row.balanceGbp),
      rowBalanceAfterGbp,
      fullyAllocated: rowBalanceAfterGbp <= 0.005,
    });
  }

  return {
    allocations,
    unallocatedGbp: remaining,
    totalOutstandingGbp,
  };
}

/**
 * Apply approved extra-charge receipts to add_to_balance lines, oldest first.
 * `paid_now` lines are treated as already collected.
 */
export function allocateExtraChargeReceiptsToLines(
  charges: readonly Pick<
    HireDriverChargeLineItemRow,
    "id" | "amountGbp" | "resolution" | "chargedOn" | "createdAt"
  >[],
  approvedReceiptsGbp: number,
): Map<string, number> {
  const paidById = new Map<string, number>();
  const ordered = [...charges].sort((a, b) => {
    const aDate = a.chargedOn || a.createdAt || "";
    const bDate = b.chargedOn || b.createdAt || "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.id.localeCompare(b.id);
  });

  let remaining = roundGbp(Math.max(0, approvedReceiptsGbp));
  for (const item of ordered) {
    if (item.resolution === "paid_now") {
      paidById.set(item.id, roundGbp(item.amountGbp));
      continue;
    }
    if (item.resolution !== "add_to_balance") {
      paidById.set(item.id, 0);
      continue;
    }
    const allocated = roundGbp(Math.min(item.amountGbp, remaining));
    paidById.set(item.id, allocated);
    remaining = roundGbp(remaining - allocated);
  }
  return paidById;
}

export function approvedExtraChargeReceiptsGbp(
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[],
): number {
  let total = 0;
  for (const payment of receipts) {
    if (payment.paymentCategory !== "driver_charge") continue;
    if (payment.direction !== "received_from_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function buildExtraChargePaymentTableRows(input: {
  charges: readonly HireDriverChargeLineItemRow[];
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[];
  pendingAmountGbp?: number;
  allowMutate?: boolean;
}): ExtraChargePaymentTableRow[] {
  const paidNowGbp = input.charges
    .filter((item) => item.resolution === "paid_now")
    .reduce((sum, item) => sum + item.amountGbp, 0);
  const receiptsAgainstExtras = roundGbp(
    Math.max(0, approvedExtraChargeReceiptsGbp(input.receipts) - paidNowGbp),
  );
  const paidById = allocateExtraChargeReceiptsToLines(input.charges, receiptsAgainstExtras);
  let pendingRemaining = roundGbp(Math.max(0, input.pendingAmountGbp ?? 0));

  const rows: ExtraChargePaymentTableRow[] = [];
  const ordered = [...input.charges].sort((a, b) => {
    const aDate = a.chargedOn || a.createdAt || "";
    const bDate = b.chargedOn || b.createdAt || "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.id.localeCompare(b.id);
  });

  for (const item of ordered) {
    const dueGbp = roundGbp(item.amountGbp);
    const voided = item.resolution === "voided";
    const waived = item.resolution === "waived";
    const paidGbp = voided || waived ? 0 : roundGbp(paidById.get(item.id) ?? 0);
    const unpaidGbp = voided || waived ? 0 : roundGbp(Math.max(0, dueGbp - paidGbp));
    let status: ExtraChargePaymentDisplayStatus = "due";
    if (voided) status = "voided";
    else if (waived) status = "waived";
    else if (unpaidGbp <= 0.005) status = "paid";
    else if (pendingRemaining > 0.005) {
      status = "pending_approval";
      pendingRemaining = roundGbp(Math.max(0, pendingRemaining - unpaidGbp));
    } else if (paidGbp > 0.005) {
      status = "partially_paid";
    }
    const meta = extraChargePaymentStatusMeta(status);
    const adjustmentGbp = voided ? dueGbp : 0;
    const chargedGbp = voided || waived ? 0 : dueGbp;
    rows.push({
      id: item.id,
      periodLabel: hireDriverChargeTypeLabel(item.chargeType),
      chargeTypeLabel: hireDriverChargeTypeLabel(item.chargeType),
      description: item.description ?? null,
      chargedOn: item.chargedOn ?? null,
      dueGbp,
      adjustmentGbp,
      chargedGbp,
      paidGbp,
      balanceGbp: unpaidGbp,
      status,
      statusLabel: meta.label,
      statusTone: meta.tone,
      canMutate:
        input.allowMutate === true &&
        item.sourceKind === "staff_manual" &&
        !item.balancePaymentId &&
        !voided,
    });
  }
  return rows;
}

export function extraChargeSubmitBlock(input: {
  outstandingGbp: number;
  pending: OpenExtraChargePayment | null;
  amountGbp: number;
}): string | null {
  if (input.pending) return "An extra-charge payment is already pending approval.";
  if (input.outstandingGbp <= 0.005) return "There are no outstanding extra charges to pay.";
  if (!Number.isFinite(input.amountGbp) || input.amountGbp <= 0.005) {
    return "Enter a valid payment amount.";
  }
  if (input.amountGbp - input.outstandingGbp > 0.005) {
    return "Amount exceeds outstanding extra charges.";
  }
  return null;
}

export function buildExtraChargePaymentTableRowsFromWorkspace(input: {
  hireGroupId: string;
  items: readonly {
    id: string;
    chargeType: string;
    amountGbp: number;
    resolution: string;
    sourceKind: string;
    description: string | null;
    chargedOn: string | null;
    createdAt: string;
  }[];
  outstandingGbp: number;
  pendingAmountGbp?: number;
  allowMutate?: boolean;
}): ExtraChargePaymentTableRow[] {
  const charges: HireDriverChargeLineItemRow[] = input.items.map((item) => ({
    id: item.id,
    hireGroupId: input.hireGroupId,
    chargeType: item.chargeType as HireDriverChargeLineItemRow["chargeType"],
    amountGbp: item.amountGbp,
    resolution: item.resolution as HireDriverChargeLineItemRow["resolution"],
    sourceKind: item.sourceKind as HireDriverChargeLineItemRow["sourceKind"],
    description: item.description,
    chargedOn: item.chargedOn,
    createdAt: item.createdAt,
  }));

  let paidNowGbp = 0;
  let addToBalanceGbp = 0;
  for (const item of charges) {
    if (item.resolution === "paid_now") paidNowGbp += item.amountGbp;
    if (item.resolution === "add_to_balance") addToBalanceGbp += item.amountGbp;
  }
  const receiptsAgainstExtras = roundGbp(Math.max(0, addToBalanceGbp - input.outstandingGbp));
  const receiptsGbp = roundGbp(paidNowGbp + receiptsAgainstExtras);
  const receipts: Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[] =
    receiptsGbp > 0.005
      ? [{ amountGbp: receiptsGbp, direction: "received_from_driver", paymentCategory: "driver_charge" }]
      : [];

  return buildExtraChargePaymentTableRows({
    charges,
    receipts,
    pendingAmountGbp: input.pendingAmountGbp,
    allowMutate: input.allowMutate,
  });
}
