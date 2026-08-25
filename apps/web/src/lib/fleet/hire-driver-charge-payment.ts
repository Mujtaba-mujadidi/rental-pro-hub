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
  "driver_charge_payment_recorded",
  "driver_charge_payment_amended",
] as const;

export type ExtraChargePaymentEventType = (typeof EXTRA_CHARGE_PAYMENT_EVENT_TYPES)[number];

export type ExtraChargePaymentEventInput = {
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  summary?: string | null;
};

export type OpenExtraChargePaymentAllocation = {
  chargeLineItemId: string;
  amountGbp: number;
  label?: string;
};

export type OpenExtraChargePayment = {
  submissionId: string;
  amountGbp: number;
  paymentReference: string | null;
  submittedAt: string;
  /** Preview split captured at driver submit; prefer on approve when still valid. */
  allocations?: OpenExtraChargePaymentAllocation[];
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
  /** Void / structural mutate (staff manual, not tied to paid_now payment). */
  canMutate: boolean;
  /** Edit charge fields — blocked once paid or pending approval. */
  canEdit: boolean;
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

function allocationsFromMetadata(
  metadata: Record<string, unknown> | null,
): OpenExtraChargePaymentAllocation[] | undefined {
  const raw = metadata?.allocations;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const allocations: OpenExtraChargePaymentAllocation[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const chargeLineItemId = String(item.chargeLineItemId ?? item.rowId ?? "").trim();
    const amountGbp = Number(item.amountGbp ?? item.allocatedGbp);
    if (!chargeLineItemId || !Number.isFinite(amountGbp) || amountGbp <= 0.005) continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    allocations.push({
      chargeLineItemId,
      amountGbp: roundGbp(amountGbp),
      ...(label ? { label } : {}),
    });
  }
  return allocations.length ? allocations : undefined;
}

/** True when submitted allocations still cover the same amount against open balances. */
export function submittedExtraChargeAllocationsAreValid(
  allocations: readonly OpenExtraChargePaymentAllocation[],
  rows: readonly ExtraChargePaymentAllocationRow[],
  expectedAmountGbp: number,
): boolean {
  if (!allocations.length) return false;
  const balanceById = new Map(rows.map((row) => [row.id, roundGbp(row.balanceGbp)]));
  let total = 0;
  for (const line of allocations) {
    const open = balanceById.get(line.chargeLineItemId);
    if (open == null || line.amountGbp - open > 0.005) return false;
    total = roundGbp(total + line.amountGbp);
  }
  return Math.abs(total - roundGbp(expectedAmountGbp)) <= 0.005;
}

/** Latest extra-charge payment still waiting for staff review. */
export function resolveOpenExtraChargePayment(
  events: readonly ExtraChargePaymentEventInput[],
): OpenExtraChargePayment | null {
  const latestBySubmission = new Map<
    string,
    {
      status: ExtraChargePaymentEventType;
      submittedAt: string;
      amountGbp: number;
      paymentReference: string | null;
      allocations?: OpenExtraChargePaymentAllocation[];
    }
  >();

  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const event of ordered) {
    if (!isExtraChargePaymentEventType(event.eventType)) continue;
    const submissionId = textFromMetadata(event.metadata, "submissionId");
    const amountGbp = amountFromMetadata(event.metadata, "amountGbp");
    if (!submissionId || amountGbp == null) continue;
    const existing = latestBySubmission.get(submissionId);
    const allocations =
      event.eventType === "driver_charge_payment_submitted"
        ? allocationsFromMetadata(event.metadata) ?? existing?.allocations
        : existing?.allocations;
    latestBySubmission.set(submissionId, {
      status: event.eventType,
      submittedAt: existing?.submittedAt ?? event.createdAt,
      amountGbp: existing?.amountGbp ?? amountGbp,
      paymentReference:
        textFromMetadata(event.metadata, "paymentReference") ?? existing?.paymentReference ?? null,
      allocations,
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
      allocations: item.allocations,
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
 * Pour a payment across outstanding extra-charge lines.
 * Default order is the row list order (callers usually sort oldest first).
 * Pass `orderedRowIds` to restrict and reorder (manual allocate).
 */
export function allocateExtraChargePaymentAcrossRows(
  paymentAmountGbp: number,
  rows: readonly ExtraChargePaymentAllocationRow[],
  options?: { orderedRowIds?: readonly string[] },
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
  const orderedIds = options?.orderedRowIds?.map((id) => id.trim()).filter(Boolean) ?? null;
  const orderedEligible = orderedIds
    ? orderedIds
        .map((id) => eligible.find((row) => row.id === id))
        .filter((row): row is ExtraChargePaymentAllocationRow => row != null)
    : eligible;

  let remaining = amount;
  const allocations: ExtraChargePaymentAllocationLine[] = [];
  let totalOutstandingGbp = 0;
  // Manual mode: outstanding is the selected open balances only.
  const outstandingRows = orderedIds ? orderedEligible : eligible;

  for (const row of outstandingRows) {
    totalOutstandingGbp = roundGbp(totalOutstandingGbp + row.balanceGbp);
  }

  for (const row of orderedEligible) {
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

/** True when every id is an open, payable extra-charge row on this hire. */
export function selectedExtraChargeRowIdsAreValid(
  selectedRowIds: readonly string[],
  rows: readonly ExtraChargePaymentAllocationRow[],
): boolean {
  if (selectedRowIds.length === 0) return false;
  const seen = new Set<string>();
  for (const rawId of selectedRowIds) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    const row = rows.find((candidate) => candidate.id === id);
    if (
      !row ||
      row.balanceGbp <= 0.005 ||
      row.status === "paid" ||
      row.status === "waived" ||
      row.status === "voided" ||
      row.status === "pending_approval"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Rebuild the pending-payment allocation preview for staff review.
 * Rows marked pending_approval are treated as still open so FIFO / stored splits replay correctly.
 */
export function previewExtraChargePendingAllocation(input: {
  amountGbp: number;
  rows: readonly ExtraChargePaymentAllocationRow[];
  storedAllocations?: readonly OpenExtraChargePaymentAllocation[];
}): ExtraChargePaymentAllocationResult {
  const allocationRows = input.rows.map((row) => ({
    ...row,
    status: row.status === "pending_approval" ? ("due" as const) : row.status,
  }));
  const stored = input.storedAllocations ?? [];
  if (submittedExtraChargeAllocationsAreValid(stored, allocationRows, input.amountGbp)) {
    const allocations: ExtraChargePaymentAllocationLine[] = [];
    let totalOutstandingGbp = 0;
    for (const row of allocationRows) {
      if (row.balanceGbp > 0.005) {
        totalOutstandingGbp = roundGbp(totalOutstandingGbp + row.balanceGbp);
      }
    }
    for (const line of stored) {
      const row = allocationRows.find((item) => item.id === line.chargeLineItemId);
      const balanceBefore = roundGbp(row?.balanceGbp ?? line.amountGbp);
      const balanceAfter = roundGbp(Math.max(0, balanceBefore - line.amountGbp));
      allocations.push({
        rowId: line.chargeLineItemId,
        label: line.label ?? (row ? extraChargeAllocationLabel(row) : "Extra charge"),
        allocatedGbp: roundGbp(line.amountGbp),
        rowBalanceBeforeGbp: balanceBefore,
        rowBalanceAfterGbp: balanceAfter,
        fullyAllocated: balanceAfter <= 0.005,
      });
    }
    return { allocations, unallocatedGbp: 0, totalOutstandingGbp };
  }
  return allocateExtraChargePaymentAcrossRows(input.amountGbp, allocationRows);
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
  // Match payment preview / approve pour order: creation time first, then charge date.
  // Using chargedOn first flipped allocation when two charges shared a charge date.
  const ordered = [...charges].sort((a, b) => {
    const aDate = a.createdAt || a.chargedOn || "";
    const bDate = b.createdAt || b.chargedOn || "";
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

export type ExtraChargeReceiptAllocationSlice = {
  paymentId: string;
  chargeLineItemId: string;
  allocatedGbp: number;
};

/**
 * Allocate each approved extra-charge receipt onto add_to_balance lines in FIFO order.
 * One payment that covers two charges yields two slices; two payments on one charge yield two slices.
 *
 * A payment is only poured onto charges that already existed at `paidAt` (by `createdAt`).
 * Later charges must not absorb cash that was taken before they were posted.
 */
export function allocateExtraChargeReceiptPaymentsToLines(
  charges: readonly Pick<
    HireDriverChargeLineItemRow,
    "id" | "amountGbp" | "resolution" | "chargedOn" | "createdAt"
  >[],
  payments: readonly { id: string; amountGbp: number; paidAt: string }[],
): ExtraChargeReceiptAllocationSlice[] {
  const remainingByCharge = new Map<string, number>();
  const orderedCharges = [...charges].sort((a, b) => {
    const aDate = a.createdAt || a.chargedOn || "";
    const bDate = b.createdAt || b.chargedOn || "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.id.localeCompare(b.id);
  });

  for (const charge of orderedCharges) {
    if (charge.resolution === "add_to_balance") {
      remainingByCharge.set(charge.id, roundGbp(charge.amountGbp));
    }
  }

  const slices: ExtraChargeReceiptAllocationSlice[] = [];
  const orderedPayments = [...payments].sort((a, b) => {
    if (a.paidAt !== b.paidAt) return a.paidAt.localeCompare(b.paidAt);
    return a.id.localeCompare(b.id);
  });

  for (const payment of orderedPayments) {
    let remaining = roundGbp(Math.max(0, payment.amountGbp));
    if (remaining <= 0.005) continue;
    for (const charge of orderedCharges) {
      if (remaining <= 0.005) break;
      const chargeCreatedAt = charge.createdAt || charge.chargedOn || "";
      // Skip charges posted after this payment was taken.
      if (chargeCreatedAt && payment.paidAt && chargeCreatedAt > payment.paidAt) continue;
      const open = remainingByCharge.get(charge.id) ?? 0;
      if (open <= 0.005) continue;
      const allocatedGbp = roundGbp(Math.min(remaining, open));
      remainingByCharge.set(charge.id, roundGbp(open - allocatedGbp));
      remaining = roundGbp(remaining - allocatedGbp);
      slices.push({
        paymentId: payment.id,
        chargeLineItemId: charge.id,
        allocatedGbp,
      });
    }
  }

  return slices;
}

/** Sum allocated receipt amounts per charge line (add_to_balance only). */
export function sumExtraChargeReceiptAllocationsByChargeId(
  slices: readonly ExtraChargeReceiptAllocationSlice[],
): Map<string, number> {
  const paidById = new Map<string, number>();
  for (const slice of slices) {
    paidById.set(
      slice.chargeLineItemId,
      roundGbp((paidById.get(slice.chargeLineItemId) ?? 0) + slice.allocatedGbp),
    );
  }
  return paidById;
}

/**
 * Prefer staff/driver allocation metadata when present; otherwise temporal FIFO.
 * `paid_now`-linked payment IDs are never poured onto add_to_balance lines.
 */
export function resolveExtraChargeReceiptAllocationSlices(input: {
  charges: readonly Pick<
    HireDriverChargeLineItemRow,
    "id" | "amountGbp" | "resolution" | "chargedOn" | "createdAt" | "balancePaymentId"
  >[];
  payments: readonly { id: string; amountGbp: number; paidAt: string }[];
  /** Recorded/approved payment events that may include per-line allocations. */
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
}): ExtraChargeReceiptAllocationSlice[] {
  const paidNowPaymentIds = new Set(
    input.charges
      .filter((row) => row.resolution === "paid_now" && row.balancePaymentId)
      .map((row) => row.balancePaymentId as string),
  );

  const slices: ExtraChargeReceiptAllocationSlice[] = [];
  const paymentsCoveredByMetadata = new Set<string>();

  // Latest recorded/approved/amended allocations win per balance payment (amend overrides approve).
  const latestAllocationsByPaymentId = new Map<string, ExtraChargeReceiptAllocationSlice[]>();
  for (const event of input.allocationEvents ?? []) {
    if (
      event.eventType !== "driver_charge_payment_recorded" &&
      event.eventType !== "driver_charge_payment_approved" &&
      event.eventType !== "driver_charge_payment_amended"
    ) {
      continue;
    }
    const metadata = event.metadata ?? {};
    const paymentId = String(metadata.balancePaymentId ?? "").trim();
    if (!paymentId || paidNowPaymentIds.has(paymentId)) continue;
    const allocations = metadata.allocations;
    if (!Array.isArray(allocations)) continue;

    const nextSlices: ExtraChargeReceiptAllocationSlice[] = [];
    for (const row of allocations) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const chargeLineItemId = String(item.chargeLineItemId ?? item.rowId ?? "").trim();
      const amountGbp = Number(item.amountGbp ?? item.allocatedGbp);
      if (!chargeLineItemId || !Number.isFinite(amountGbp) || amountGbp <= 0.005) continue;
      nextSlices.push({
        paymentId,
        chargeLineItemId,
        allocatedGbp: roundGbp(amountGbp),
      });
    }
    // Empty allocations on amend means this payment no longer funds any open extras.
    latestAllocationsByPaymentId.set(paymentId, nextSlices);
  }
  for (const [paymentId, paymentSlices] of latestAllocationsByPaymentId) {
    slices.push(...paymentSlices);
    paymentsCoveredByMetadata.add(paymentId);
  }

  const remainingPayments = input.payments.filter(
    (payment) => !paidNowPaymentIds.has(payment.id) && !paymentsCoveredByMetadata.has(payment.id),
  );
  if (remainingPayments.length) {
    // Reduce remaining open balances by metadata allocations before FIFO fallback.
    const chargesForFifo = input.charges.map((charge) => {
      if (charge.resolution !== "add_to_balance") return charge;
      const alreadyPaid = slices
        .filter((slice) => slice.chargeLineItemId === charge.id)
        .reduce((sum, slice) => sum + slice.allocatedGbp, 0);
      return {
        ...charge,
        amountGbp: roundGbp(Math.max(0, charge.amountGbp - alreadyPaid)),
      };
    });
    slices.push(...allocateExtraChargeReceiptPaymentsToLines(chargesForFifo, remainingPayments));
  }

  return slices;
}

export function buildExtraChargePaidByChargeId(input: {
  charges: readonly Pick<
    HireDriverChargeLineItemRow,
    "id" | "amountGbp" | "resolution" | "chargedOn" | "createdAt" | "balancePaymentId"
  >[];
  payments: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
}): Map<string, number> {
  const paidById = sumExtraChargeReceiptAllocationsByChargeId(
    resolveExtraChargeReceiptAllocationSlices(input),
  );
  for (const charge of input.charges) {
    if (charge.resolution === "paid_now") {
      paidById.set(charge.id, roundGbp(charge.amountGbp));
    } else if (charge.resolution !== "add_to_balance") {
      paidById.set(charge.id, 0);
    } else if (!paidById.has(charge.id)) {
      paidById.set(charge.id, 0);
    }
  }
  return paidById;
}

export function buildExtraChargePaymentTableRows(input: {
  charges: readonly HireDriverChargeLineItemRow[];
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[];
  /** When set, paid amounts use temporal / stored allocations instead of pooled FIFO. */
  timedPayments?: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
  pendingAmountGbp?: number;
  allowMutate?: boolean;
  /**
   * When true, `receipts` already exclude paid_now cash (e.g. reconstructed from
   * add_to_balance outstanding). Do not subtract paid_now amounts again.
   */
  receiptsExcludePaidNow?: boolean;
}): ExtraChargePaymentTableRow[] {
  const paidNowGbp = input.charges
    .filter((item) => item.resolution === "paid_now")
    .reduce((sum, item) => sum + item.amountGbp, 0);

  let paidById: Map<string, number>;
  if (input.timedPayments?.length) {
    paidById = buildExtraChargePaidByChargeId({
      charges: input.charges,
      payments: input.timedPayments,
      allocationEvents: input.allocationEvents,
    });
  } else {
    const approvedReceiptsGbp = approvedExtraChargeReceiptsGbp(input.receipts);
    const receiptsAgainstExtras = input.receiptsExcludePaidNow
      ? approvedReceiptsGbp
      : roundGbp(Math.max(0, approvedReceiptsGbp - paidNowGbp));
    paidById = allocateExtraChargeReceiptsToLines(input.charges, receiptsAgainstExtras);
  }
  let pendingRemaining = roundGbp(Math.max(0, input.pendingAmountGbp ?? 0));

  const rows: ExtraChargePaymentTableRow[] = [];
  const ordered = [...input.charges].sort((a, b) => {
    const aDate = a.createdAt || a.chargedOn || "";
    const bDate = b.createdAt || b.chargedOn || "";
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
      canEdit:
        input.allowMutate === true &&
        item.sourceKind === "staff_manual" &&
        !item.balancePaymentId &&
        !voided &&
        paidGbp <= 0.005 &&
        status !== "pending_approval",
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
    balancePaymentId?: string | null;
  }[];
  outstandingGbp: number;
  pendingAmountGbp?: number;
  allowMutate?: boolean;
  /** Preferred: per-receipt timing + stored allocation metadata (approve/amend). */
  timedPayments?: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
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
    balancePaymentId: item.balancePaymentId ?? null,
  }));

  if (input.timedPayments?.length) {
    return buildExtraChargePaymentTableRows({
      charges,
      receipts: [],
      timedPayments: input.timedPayments,
      allocationEvents: input.allocationEvents,
      pendingAmountGbp: input.pendingAmountGbp,
      allowMutate: input.allowMutate,
    });
  }

  let addToBalanceGbp = 0;
  for (const item of charges) {
    if (item.resolution === "add_to_balance") addToBalanceGbp += item.amountGbp;
  }
  const receiptsAgainstExtras = roundGbp(Math.max(0, addToBalanceGbp - input.outstandingGbp));
  /**
   * Only pass money that reduced add_to_balance outstanding.
   * `paid_now` lines are marked paid from resolution inside `buildExtraChargePaymentTableRows`
   * — including them here double-counts the same cash onto later charges.
   */
  const receipts: Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[] =
    receiptsAgainstExtras > 0.005
      ? [
          {
            amountGbp: receiptsAgainstExtras,
            direction: "received_from_driver",
            paymentCategory: "driver_charge",
          },
        ]
      : [];

  return buildExtraChargePaymentTableRows({
    charges,
    receipts,
    pendingAmountGbp: input.pendingAmountGbp,
    allowMutate: input.allowMutate,
    receiptsExcludePaidNow: true,
  });
}

export function planExtraChargePaidAmendment(input: {
  chargeLineItemId: string;
  newPaidGbp: number;
  charges: readonly Pick<
    HireDriverChargeLineItemRow,
    "id" | "amountGbp" | "resolution" | "chargedOn" | "createdAt" | "balancePaymentId"
  >[];
  payments: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
}):
  | {
      ok: true;
      previousPaidGbp: number;
      newPaidGbp: number;
      /** Charged-now lines become add_to_balance so remaining cash and income follow receipts. */
      convertToAddToBalance: boolean;
      paymentUpdates: Array<{
        paymentId: string;
        previousAmountGbp: number;
        newAmountGbp: number;
        allocations: OpenExtraChargePaymentAllocation[];
      }>;
    }
  | { ok: false; error: string } {
  const chargeId = input.chargeLineItemId.trim();
  const charge = input.charges.find((row) => row.id === chargeId);
  if (!charge) return { ok: false, error: "Charge not found." };
  if (charge.resolution !== "add_to_balance" && charge.resolution !== "paid_now") {
    return { ok: false, error: "Only collected extra charges can have payments amended." };
  }

  const newPaidGbp = roundGbp(Math.max(0, input.newPaidGbp));
  if (newPaidGbp - charge.amountGbp > 0.005) {
    return { ok: false, error: "Paid amount cannot exceed the charge." };
  }

  if (charge.resolution === "paid_now") {
    const paymentId = charge.balancePaymentId?.trim() || "";
    const payment = paymentId ? input.payments.find((row) => row.id === paymentId) : undefined;
    if (!paymentId || !payment) {
      return { ok: false, error: "Could not find the charged-now payment to amend." };
    }
    const previousPaidGbp = roundGbp(charge.amountGbp);
    if (Math.abs(previousPaidGbp - newPaidGbp) <= 0.005) {
      return { ok: false, error: "Enter a different paid amount to amend this charge." };
    }
    if (newPaidGbp - previousPaidGbp > 0.005) {
      return {
        ok: false,
        error: "Increasing paid amount is not supported here. Record a new payment instead.",
      };
    }
    return {
      ok: true,
      previousPaidGbp,
      newPaidGbp,
      convertToAddToBalance: true,
      paymentUpdates: [
        {
          paymentId,
          previousAmountGbp: roundGbp(payment.amountGbp),
          newAmountGbp: newPaidGbp,
          allocations:
            newPaidGbp > 0.005 ? [{ chargeLineItemId: chargeId, amountGbp: newPaidGbp }] : [],
        },
      ],
    };
  }

  const slices = resolveExtraChargeReceiptAllocationSlices({
    charges: input.charges,
    payments: input.payments,
    allocationEvents: input.allocationEvents,
  });
  const currentPaidGbp = roundGbp(
    slices
      .filter((slice) => slice.chargeLineItemId === chargeId)
      .reduce((sum, slice) => sum + slice.allocatedGbp, 0),
  );
  if (Math.abs(currentPaidGbp - newPaidGbp) <= 0.005) {
    return { ok: false, error: "Enter a different paid amount to amend this charge." };
  }
  if (newPaidGbp - currentPaidGbp > 0.005) {
    return {
      ok: false,
      error: "Increasing paid amount is not supported here. Record a new payment instead.",
    };
  }

  let reduceBy = roundGbp(currentPaidGbp - newPaidGbp);
  const paymentById = new Map(input.payments.map((payment) => [payment.id, payment]));
  const allocationsByPayment = new Map<string, Map<string, number>>();
  for (const slice of slices) {
    const bucket = allocationsByPayment.get(slice.paymentId) ?? new Map<string, number>();
    bucket.set(
      slice.chargeLineItemId,
      roundGbp((bucket.get(slice.chargeLineItemId) ?? 0) + slice.allocatedGbp),
    );
    allocationsByPayment.set(slice.paymentId, bucket);
  }

  const chargeSlicesNewestFirst = slices
    .filter((slice) => slice.chargeLineItemId === chargeId)
    .sort((a, b) => {
      const aPaid = paymentById.get(a.paymentId)?.paidAt ?? "";
      const bPaid = paymentById.get(b.paymentId)?.paidAt ?? "";
      if (aPaid !== bPaid) return bPaid.localeCompare(aPaid);
      return b.paymentId.localeCompare(a.paymentId);
    });

  for (const slice of chargeSlicesNewestFirst) {
    if (reduceBy <= 0.005) break;
    const bucket = allocationsByPayment.get(slice.paymentId);
    if (!bucket) continue;
    const current = bucket.get(chargeId) ?? 0;
    if (current <= 0.005) continue;
    const take = roundGbp(Math.min(current, reduceBy));
    const next = roundGbp(current - take);
    if (next <= 0.005) bucket.delete(chargeId);
    else bucket.set(chargeId, next);
    reduceBy = roundGbp(reduceBy - take);
  }
  if (reduceBy > 0.005) {
    return { ok: false, error: "Could not reallocate the amended payment." };
  }

  const touchedPaymentIds = new Set(chargeSlicesNewestFirst.map((slice) => slice.paymentId));
  const paymentUpdates: Array<{
    paymentId: string;
    previousAmountGbp: number;
    newAmountGbp: number;
    allocations: OpenExtraChargePaymentAllocation[];
  }> = [];

  for (const paymentId of touchedPaymentIds) {
    const payment = paymentById.get(paymentId);
    if (!payment) continue;
    const bucket = allocationsByPayment.get(paymentId) ?? new Map<string, number>();
    const allocations: OpenExtraChargePaymentAllocation[] = [];
    let newAmountGbp = 0;
    for (const [lineId, amountGbp] of bucket) {
      if (amountGbp <= 0.005) continue;
      allocations.push({ chargeLineItemId: lineId, amountGbp });
      newAmountGbp = roundGbp(newAmountGbp + amountGbp);
    }
    paymentUpdates.push({
      paymentId,
      previousAmountGbp: roundGbp(payment.amountGbp),
      newAmountGbp,
      allocations,
    });
  }

  return {
    ok: true,
    previousPaidGbp: currentPaidGbp,
    newPaidGbp,
    convertToAddToBalance: false,
    paymentUpdates,
  };
}

/** Outstanding add_to_balance extras after temporal / stored allocation of receipts. */
export function outstandingExtraChargesFromTimedPaymentsGbp(input: {
  charges: readonly HireDriverChargeLineItemRow[];
  payments: readonly { id: string; amountGbp: number; paidAt: string }[];
  allocationEvents?: readonly {
    eventType: string;
    metadata: Record<string, unknown> | null;
  }[];
}): number {
  const paidById = buildExtraChargePaidByChargeId(input);
  let outstanding = 0;
  for (const charge of input.charges) {
    if (charge.resolution !== "add_to_balance") continue;
    const paid = paidById.get(charge.id) ?? 0;
    outstanding = roundGbp(outstanding + Math.max(0, charge.amountGbp - paid));
  }
  return outstanding;
}
