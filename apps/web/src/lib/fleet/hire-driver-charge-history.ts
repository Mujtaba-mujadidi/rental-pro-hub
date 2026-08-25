import type { HirePaymentRowEventDisplay } from "@/lib/fleet/hire-payment-row-history";
import { formatAuditActorLabel } from "@/lib/fleet/hire-audit";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { hirePaymentMethodLabel } from "@/lib/fleet/hire-settlement-payment-method";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  resolveExtraChargeReceiptAllocationSlices,
  isExtraChargePaymentEventType,
  type ExtraChargePaymentEventInput,
} from "@/lib/fleet/hire-driver-charge-payment";
import type { HireDriverChargeLineItemRow } from "@/lib/fleet/hire-driver-charges";

export type HireDriverChargeHistoryEventInput = {
  id: string;
  eventType:
    | "driver_charge_added"
    | "driver_charge_amended"
    | "driver_charge_voided"
    | "driver_charge_removed";
  createdAt: string;
  actorDisplayName?: string | null;
  metadata: Record<string, unknown>;
  summary?: string | null;
};

export type HireDriverChargePaymentHistoryInput = {
  id: string;
  amountGbp: number;
  paidAt: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentAccountName: string | null;
  notes: string | null;
  actorDisplayName?: string | null;
};

function amountFromMetadata(metadata: Record<string, unknown>, key: string): number | null {
  const amount = Number(metadata[key]);
  return Number.isFinite(amount) ? amount : null;
}

function textFromMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Charge add / amend / void events in the same shape as payment-row history. */
export function formatHireDriverChargeHistoryEvent(
  event: HireDriverChargeHistoryEventInput,
): HirePaymentRowEventDisplay {
  const metadata = event.metadata;
  const reason = textFromMetadata(metadata, "reason") ?? event.summary?.trim() ?? null;
  const typeLabel = textFromMetadata(metadata, "chargeTypeLabel");
  const description = textFromMetadata(metadata, "description");
  const previousAmountGbp = amountFromMetadata(metadata, "previousAmountGbp");
  const amountGbp = amountFromMetadata(metadata, "amountGbp");
  const detailLines: string[] = [];
  let title = "Charge updated";

  if (event.eventType === "driver_charge_added") {
    title = "Charge added";
    if (amountGbp != null) detailLines.push(`Amount: ${formatGbp(amountGbp)}`);
    if (typeLabel) detailLines.push(`Type: ${typeLabel}`);
    if (description) detailLines.push(description);
  } else if (event.eventType === "driver_charge_amended") {
    title = "Charge amended";
    if (previousAmountGbp != null && amountGbp != null) {
      detailLines.push(`Changed from ${formatGbp(previousAmountGbp)} to ${formatGbp(amountGbp)}`);
    } else if (amountGbp != null) {
      detailLines.push(`New amount: ${formatGbp(amountGbp)}`);
    }
    if (typeLabel) detailLines.push(`Type: ${typeLabel}`);
  } else if (event.eventType === "driver_charge_voided") {
    title = "Charge voided";
    if (amountGbp != null) detailLines.push(`Voided amount: ${formatGbp(amountGbp)}`);
    if (typeLabel) detailLines.push(`Type: ${typeLabel}`);
  } else {
    title = "Charge removed";
    if (amountGbp != null) detailLines.push(`Removed amount: ${formatGbp(amountGbp)}`);
    if (typeLabel) detailLines.push(`Type: ${typeLabel}`);
  }

  return {
    id: event.id,
    title,
    body: event.eventType === "driver_charge_added" ? description : reason,
    detailLines,
    actorLabel: formatAuditActorLabel(event.actorDisplayName, "company_staff"),
    createdAt: event.createdAt,
  };
}

export function formatHireDriverChargeHistoryEvents(
  events: readonly HireDriverChargeHistoryEventInput[],
): HirePaymentRowEventDisplay[] {
  return [...events]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(formatHireDriverChargeHistoryEvent);
}

export function formatHireDriverChargePaymentHistoryEvent(
  payment: HireDriverChargePaymentHistoryInput,
  options?: { amountGbp?: number; createdAt?: string },
): HirePaymentRowEventDisplay {
  const amountGbp = options?.amountGbp ?? payment.amountGbp;
  const createdAt = options?.createdAt?.trim() || payment.paidAt;
  const detailLines: string[] = [`Amount: ${formatGbp(amountGbp)}`];
  if (payment.paymentMethod) {
    detailLines.push(`Method: ${hirePaymentMethodLabel(payment.paymentMethod)}`);
  }
  if (payment.paymentAccountName) {
    detailLines.push(`Paid into: ${payment.paymentAccountName}`);
  }
  if (payment.paymentReference?.trim()) {
    detailLines.push(`Reference: ${payment.paymentReference.trim()}`);
  }
  if (createdAt?.trim()) {
    detailLines.push(`Paid on: ${formatUkDateTime(createdAt)}`);
  }

  return {
    id: `payment:${payment.id}:${amountGbp.toFixed(2)}:${createdAt}`,
    title: "Payment recorded",
    body: payment.notes?.trim() || null,
    detailLines,
    actorLabel: formatAuditActorLabel(payment.actorDisplayName, "company_staff"),
    createdAt,
  };
}

function allocationAmountForCharge(
  metadata: Record<string, unknown> | null | undefined,
  chargeLineItemId: string,
  fallbackAmountGbp: number | null,
): number | null {
  const allocations = metadata?.allocations;
  if (Array.isArray(allocations)) {
    let total = 0;
    let matched = false;
    for (const row of allocations) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      if (String(item.chargeLineItemId ?? "") !== chargeLineItemId) continue;
      const amount = Number(item.amountGbp);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      matched = true;
      total += amount;
    }
    if (matched) return Math.round(total * 100) / 100;
  }
  if (String(metadata?.chargeLineItemId ?? "") === chargeLineItemId) {
    return fallbackAmountGbp;
  }
  return null;
}

function paymentByBalanceId(
  payments: readonly HireDriverChargePaymentHistoryInput[],
  balancePaymentId: string | null | undefined,
): HireDriverChargePaymentHistoryInput | undefined {
  const id = balancePaymentId?.trim();
  if (!id) return undefined;
  return payments.find((payment) => payment.id === id);
}

function formatHireDriverChargePaymentRecordedLifecycleEvent(input: {
  id: string;
  createdAt: string;
  actorDisplayName?: string | null;
  actorRole?: "company_staff" | "driver" | "system" | null;
  metadata: Record<string, unknown>;
  allocatedGbp: number;
  payment?: HireDriverChargePaymentHistoryInput;
}): HirePaymentRowEventDisplay {
  const metadata = input.metadata;
  const payment = input.payment;
  const method =
    textFromMetadata(metadata, "paymentMethod") ?? payment?.paymentMethod ?? null;
  const accountName =
    textFromMetadata(metadata, "paymentAccountName") ?? payment?.paymentAccountName ?? null;
  const reference =
    textFromMetadata(metadata, "paymentReference") ?? payment?.paymentReference ?? null;
  const notes = payment?.notes?.trim() || null;

  const detailLines: string[] = [`Amount: ${formatGbp(input.allocatedGbp)}`];
  if (method) detailLines.push(`Method: ${hirePaymentMethodLabel(method)}`);
  if (accountName) detailLines.push(`Paid into: ${accountName}`);
  if (reference) detailLines.push(`Reference: ${reference}`);
  detailLines.push(`Paid on: ${formatUkDateTime(input.createdAt)}`);

  return {
    id: input.id,
    title: "Payment recorded",
    body: notes,
    detailLines,
    actorLabel: formatAuditActorLabel(
      input.actorDisplayName,
      input.actorRole ?? "company_staff",
    ),
    createdAt: input.createdAt,
  };
}

export function formatHireDriverChargePaymentLifecycleEvent(input: {
  id: string;
  eventType: string;
  createdAt: string;
  actorDisplayName?: string | null;
  actorRole?: "company_staff" | "driver" | "system" | null;
  metadata: Record<string, unknown> | null;
  allocatedGbp: number;
}): HirePaymentRowEventDisplay | null {
  if (!isExtraChargePaymentEventType(input.eventType)) return null;
  if (
    input.eventType === "driver_charge_payment_recorded" ||
    input.eventType === "driver_charge_payment_approved"
  ) {
    return null;
  }

  const metadata = input.metadata ?? {};
  const reference =
    typeof metadata.paymentReference === "string" ? metadata.paymentReference.trim() : "";
  const comment = typeof metadata.comment === "string" ? metadata.comment.trim() : "";
  const reason = textFromMetadata(metadata, "reason") ?? comment;

  let title = "Payment updated";
  const detailLines: string[] = [];
  if (input.eventType === "driver_charge_payment_submitted") title = "Payment submitted";
  if (input.eventType === "driver_charge_payment_rejected") title = "Payment rejected";
  if (input.eventType === "driver_charge_payment_amended") {
    title = "Payment amended";
    const previousPaidGbp = amountFromMetadata(metadata, "previousPaidGbp");
    const newPaidGbp =
      amountFromMetadata(metadata, "newPaidGbp") ?? amountFromMetadata(metadata, "amountGbp");
    if (previousPaidGbp != null && newPaidGbp != null) {
      detailLines.push(`Changed from ${formatGbp(previousPaidGbp)} to ${formatGbp(newPaidGbp)}`);
    } else {
      detailLines.push(`Amount: ${formatGbp(input.allocatedGbp)}`);
    }
  } else {
    detailLines.push(`Amount: ${formatGbp(input.allocatedGbp)}`);
  }
  if (reference) detailLines.push(`Reference: ${reference}`);

  return {
    id: input.id,
    title,
    body: reason || null,
    detailLines,
    actorLabel: formatAuditActorLabel(
      input.actorDisplayName,
      input.actorRole ??
        (input.eventType === "driver_charge_payment_submitted" ? "driver" : "company_staff"),
    ),
    createdAt: input.createdAt,
  };
}

/**
 * Build chronological charge history: lifecycle events + each payment transaction that touched the line.
 * Payment amounts come from audit events when present so amended receipts stay historically accurate.
 */
export function mergeHireDriverChargeHistory(input: {
  chargeLineItemId: string;
  lifecycleEvents: readonly HireDriverChargeHistoryEventInput[];
  charges: readonly {
    id: string;
    amountGbp: number;
    resolution: string;
    chargedOn: string | null;
    createdAt: string;
    balancePaymentId?: string | null;
  }[];
  payments: readonly HireDriverChargePaymentHistoryInput[];
  paymentLifecycleEvents?: readonly (ExtraChargePaymentEventInput & {
    id: string;
    actorDisplayName?: string | null;
    actorRole?: "company_staff" | "driver" | "system" | null;
  })[];
}): HirePaymentRowEventDisplay[] {
  const items: HirePaymentRowEventDisplay[] = [
    ...formatHireDriverChargeHistoryEvents(input.lifecycleEvents),
  ];

  const chargeLineItemId = input.chargeLineItemId;
  const recordedPaymentIds = new Set<string>();

  for (const event of input.paymentLifecycleEvents ?? []) {
    if (
      event.eventType !== "driver_charge_payment_recorded" &&
      event.eventType !== "driver_charge_payment_approved"
    ) {
      continue;
    }
    const metadata = event.metadata ?? {};
    const amountGbp = amountFromMetadata(metadata, "amountGbp");
    const allocatedGbp = allocationAmountForCharge(metadata, chargeLineItemId, amountGbp);
    if (allocatedGbp == null || allocatedGbp <= 0.005) continue;

    const balancePaymentId = textFromMetadata(metadata, "balancePaymentId");
    if (balancePaymentId) recordedPaymentIds.add(balancePaymentId);

    items.push(
      formatHireDriverChargePaymentRecordedLifecycleEvent({
        id: event.id,
        createdAt: event.createdAt,
        actorDisplayName: event.actorDisplayName,
        actorRole: event.actorRole,
        metadata,
        allocatedGbp,
        payment: paymentByBalanceId(input.payments, balancePaymentId),
      }),
    );
  }

  const charge = input.charges.find((row) => row.id === chargeLineItemId);
  if (charge?.resolution === "add_to_balance") {
    const slices = resolveExtraChargeReceiptAllocationSlices({
      charges: input.charges.map((row) => ({
        id: row.id,
        amountGbp: row.amountGbp,
        resolution: row.resolution as HireDriverChargeLineItemRow["resolution"],
        chargedOn: row.chargedOn,
        createdAt: row.createdAt,
        balancePaymentId: row.balancePaymentId,
      })),
      payments: input.payments.map((payment) => ({
        id: payment.id,
        amountGbp: payment.amountGbp,
        paidAt: payment.paidAt,
      })),
      allocationEvents: input.paymentLifecycleEvents,
    });
    for (const slice of slices) {
      if (slice.chargeLineItemId !== chargeLineItemId) continue;
      if (recordedPaymentIds.has(slice.paymentId)) continue;
      const payment = input.payments.find((row) => row.id === slice.paymentId);
      if (!payment) continue;
      items.push(
        formatHireDriverChargePaymentHistoryEvent({
          ...payment,
          amountGbp: slice.allocatedGbp,
        }),
      );
    }
  } else if (charge?.resolution === "paid_now" && charge.balancePaymentId) {
    const paidNow = input.payments.find((payment) => payment.id === charge.balancePaymentId);
    if (paidNow && !recordedPaymentIds.has(paidNow.id)) {
      items.push(
        formatHireDriverChargePaymentHistoryEvent({
          ...paidNow,
          amountGbp: Math.min(paidNow.amountGbp, charge.amountGbp),
        }),
      );
    }
  }

  for (const event of input.paymentLifecycleEvents ?? []) {
    if (
      event.eventType !== "driver_charge_payment_submitted" &&
      event.eventType !== "driver_charge_payment_rejected" &&
      event.eventType !== "driver_charge_payment_amended"
    ) {
      continue;
    }
    const metadata = event.metadata ?? {};
    if (
      event.eventType === "driver_charge_payment_amended" &&
      textFromMetadata(metadata, "chargeLineItemId") !== chargeLineItemId
    ) {
      continue;
    }
    const amountGbp = amountFromMetadata(metadata, "amountGbp");
    let allocatedGbp = allocationAmountForCharge(metadata, chargeLineItemId, amountGbp);
    if (event.eventType === "driver_charge_payment_amended") {
      allocatedGbp =
        amountFromMetadata(metadata, "newPaidGbp") ??
        amountFromMetadata(metadata, "amountGbp") ??
        allocatedGbp;
    }
    if (allocatedGbp == null && amountGbp != null) {
      const openLines = input.charges.filter((row) => row.resolution === "add_to_balance");
      if (openLines.length === 1 && openLines[0]?.id === chargeLineItemId) {
        allocatedGbp = amountGbp;
      }
    }
    if (event.eventType === "driver_charge_payment_amended") {
      if (allocatedGbp == null) continue;
    } else if (allocatedGbp == null || allocatedGbp <= 0.005) {
      continue;
    }
    const display = formatHireDriverChargePaymentLifecycleEvent({
      id: event.id,
      eventType: event.eventType,
      createdAt: event.createdAt,
      actorDisplayName: event.actorDisplayName,
      actorRole: event.actorRole,
      metadata,
      allocatedGbp: allocatedGbp ?? 0,
    });
    if (display) items.push(display);
  }

  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
