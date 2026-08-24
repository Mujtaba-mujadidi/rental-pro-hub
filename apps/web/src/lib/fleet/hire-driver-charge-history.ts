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
): HirePaymentRowEventDisplay {
  const detailLines: string[] = [`Amount: ${formatGbp(payment.amountGbp)}`];
  if (payment.paymentMethod) {
    detailLines.push(`Method: ${hirePaymentMethodLabel(payment.paymentMethod)}`);
  }
  if (payment.paymentAccountName) {
    detailLines.push(`Paid into: ${payment.paymentAccountName}`);
  }
  if (payment.paymentReference?.trim()) {
    detailLines.push(`Reference: ${payment.paymentReference.trim()}`);
  }
  if (payment.paidAt?.trim()) {
    detailLines.push(`Paid on: ${formatUkDateTime(payment.paidAt)}`);
  }

  return {
    id: `payment:${payment.id}:${payment.amountGbp.toFixed(2)}`,
    title: "Payment recorded",
    body: payment.notes?.trim() || null,
    detailLines,
    actorLabel: formatAuditActorLabel(payment.actorDisplayName, "company_staff"),
    createdAt: payment.paidAt,
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
  // Money already appears from balance_payment rows — avoid duplicate "recorded/approved" entries.
  if (
    input.eventType === "driver_charge_payment_recorded" ||
    input.eventType === "driver_charge_payment_approved"
  ) {
    return null;
  }

  const detailLines: string[] = [`Amount: ${formatGbp(input.allocatedGbp)}`];
  const reference =
    typeof input.metadata?.paymentReference === "string"
      ? input.metadata.paymentReference.trim()
      : "";
  if (reference) detailLines.push(`Reference: ${reference}`);
  const comment =
    typeof input.metadata?.comment === "string" ? input.metadata.comment.trim() : "";

  let title = "Payment updated";
  if (input.eventType === "driver_charge_payment_submitted") title = "Payment submitted";
  if (input.eventType === "driver_charge_payment_rejected") title = "Payment rejected";
  if (input.eventType === "driver_charge_payment_amended") title = "Payment amended";

  return {
    id: input.id,
    title,
    body: comment || null,
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
 * Payments come from `vehicle_hire_balance_payments` (source of truth), allocated FIFO across charges.
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

  const charge = input.charges.find((row) => row.id === input.chargeLineItemId);
  if (charge?.resolution === "paid_now" && charge.balancePaymentId) {
    const paidNow = input.payments.find((payment) => payment.id === charge.balancePaymentId);
    if (paidNow) {
      items.push(
        formatHireDriverChargePaymentHistoryEvent({
          ...paidNow,
          amountGbp: Math.min(paidNow.amountGbp, charge.amountGbp),
        }),
      );
    }
  } else if (charge?.resolution === "add_to_balance") {
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
      if (slice.chargeLineItemId !== input.chargeLineItemId) continue;
      const payment = input.payments.find((row) => row.id === slice.paymentId);
      if (!payment) continue;
      items.push(
        formatHireDriverChargePaymentHistoryEvent({
          ...payment,
          amountGbp: slice.allocatedGbp,
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
    const amountGbp = amountFromMetadata(event.metadata ?? {}, "amountGbp");
    let allocatedGbp = allocationAmountForCharge(
      event.metadata,
      input.chargeLineItemId,
      amountGbp,
    );
    if (allocatedGbp == null && amountGbp != null) {
      const openLines = input.charges.filter((row) => row.resolution === "add_to_balance");
      if (openLines.length === 1 && openLines[0]?.id === input.chargeLineItemId) {
        allocatedGbp = amountGbp;
      }
    }
    if (allocatedGbp == null || allocatedGbp <= 0.005) continue;
    const display = formatHireDriverChargePaymentLifecycleEvent({
      id: event.id,
      eventType: event.eventType,
      createdAt: event.createdAt,
      actorDisplayName: event.actorDisplayName,
      actorRole: event.actorRole,
      metadata: event.metadata,
      allocatedGbp,
    });
    if (display) items.push(display);
  }

  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
