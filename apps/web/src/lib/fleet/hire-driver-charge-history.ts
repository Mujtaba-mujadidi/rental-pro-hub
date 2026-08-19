import type { HirePaymentRowEventDisplay } from "@/lib/fleet/hire-payment-row-history";
import { formatGbp } from "@/lib/fleet/maintenance";

export type HireDriverChargeHistoryEventInput = {
  id: string;
  eventType: "driver_charge_added" | "driver_charge_amended" | "driver_charge_removed";
  createdAt: string;
  actorDisplayName?: string | null;
  metadata: Record<string, unknown>;
  summary?: string | null;
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

/** Charge add / amend / delete events in the same shape as payment-row history. */
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
    actorLabel: event.actorDisplayName?.trim() || "Staff",
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
