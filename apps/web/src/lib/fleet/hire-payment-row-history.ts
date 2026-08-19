import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";

export type HirePaymentRowEventInput = {
  id: string;
  eventKind: "status_change" | "reply" | "amendment";
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  amendmentPayload: Record<string, unknown> | null;
  actorRole: "company_staff" | "driver";
  createdAt: string;
  /** Optional resolved name (staff/driver); falls back to role label. */
  actorDisplayName?: string | null;
};

export type HirePaymentDiscountHistoryInput = {
  id: string;
  amountGbp: number;
  reason: string;
  appliedAt: string;
  appliedByDisplayName: string | null;
};

export type HirePaymentRowEventDisplay = {
  id: string;
  title: string;
  body: string | null;
  detailLines: string[];
  actorLabel: string;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  not_received: "Not received",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function actorLabelFromRole(
  role: HirePaymentRowEventInput["actorRole"],
  displayName?: string | null,
): string {
  const name = displayName?.trim();
  if (name) return name;
  return role === "driver" ? "Driver" : "Staff";
}

function amountFromPayload(payload: Record<string, unknown> | null, key: string): number | null {
  if (!payload) return null;
  const amount = Number(payload[key]);
  return Number.isFinite(amount) ? amount : null;
}

/** Discount applied on a schedule row (from vehicle_hire_schedule_discounts). */
export function formatHirePaymentDiscountEvent(
  discount: HirePaymentDiscountHistoryInput,
): HirePaymentRowEventDisplay {
  const reason = discount.reason.trim();
  return {
    id: `discount:${discount.id}`,
    title: "Discount applied",
    body: reason || null,
    detailLines: [`Amount: −${formatGbp(discount.amountGbp)}`],
    actorLabel: discount.appliedByDisplayName?.trim() || "Staff",
    createdAt: discount.appliedAt,
  };
}

/** Turn a payment audit event into user-facing copy for the row history panel. */
export function formatHirePaymentRowEvent(event: HirePaymentRowEventInput): HirePaymentRowEventDisplay {
  const payload = event.amendmentPayload;
  const detailLines: string[] = [];
  let title = "Payment updated";
  let body: string | null = event.comment?.trim() || null;
  const actorLabel = actorLabelFromRole(event.actorRole, event.actorDisplayName);

  if (event.eventKind === "reply") {
    title = "Reply";
    return {
      id: event.id,
      title,
      body,
      detailLines,
      actorLabel,
      createdAt: event.createdAt,
    };
  }

  if (
    event.eventKind === "amendment" ||
    (event.fromStatus === "approved" && event.toStatus === "not_received")
  ) {
    const previous = amountFromPayload(payload, "previousApprovedAmountGbp");
    const next = amountFromPayload(payload, "newApprovedAmountGbp");
    title = event.toStatus === "not_received" ? "Approval removed" : "Approved amount amended";
    if (previous != null && next != null) {
      detailLines.push(`Changed from ${formatGbp(previous)} to ${formatGbp(next)}`);
    } else if (next != null) {
      detailLines.push(`New approved amount: ${formatGbp(next)}`);
    }
    return {
      id: event.id,
      title,
      body,
      detailLines,
      actorLabel,
      createdAt: event.createdAt,
    };
  }

  const submitted = amountFromPayload(payload, "submittedAmountGbp");
  const approved = amountFromPayload(payload, "approvedAmountGbp");
  const reference =
    typeof payload?.paymentReference === "string" ? payload.paymentReference.trim() : "";
  const paymentMethod =
    typeof payload?.paymentMethod === "string" ? payload.paymentMethod.trim() : "";
  const paymentAccountName =
    typeof payload?.paymentAccountName === "string" ? payload.paymentAccountName.trim() : "";
  const paidOnYmd = typeof payload?.paidOnYmd === "string" ? payload.paidOnYmd.trim() : "";

  if (event.toStatus === "pending_approval") {
    title = "Payment submitted";
    if (submitted != null) detailLines.push(`Amount: ${formatGbp(submitted)}`);
    if (reference) detailLines.push(`Reference: ${reference}`);
    if (!body && reference) body = null;
  } else if (event.toStatus === "approved") {
    title = "Payment approved";
    if (approved != null) detailLines.push(`Approved total: ${formatGbp(approved)}`);
    else if (submitted != null) detailLines.push(`Amount: ${formatGbp(submitted)}`);
    if (reference) detailLines.push(`Reference: ${reference}`);
    if (paymentMethod) detailLines.push(`Method: ${paymentMethod.replace(/_/g, " ")}`);
    if (paymentAccountName) detailLines.push(`Paid into: ${paymentAccountName}`);
    if (paidOnYmd) detailLines.push(`Paid on: ${formatUkDate(paidOnYmd)}`);
  } else if (event.toStatus === "rejected") {
    title = "Payment rejected";
    if (submitted != null) detailLines.push(`Submitted amount: ${formatGbp(submitted)}`);
  } else if (event.fromStatus && event.toStatus) {
    title = `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`;
  }

  return {
    id: event.id,
    title,
    body,
    detailLines,
    actorLabel,
    createdAt: event.createdAt,
  };
}

export function formatHirePaymentRowEvents(
  events: HirePaymentRowEventInput[],
): HirePaymentRowEventDisplay[] {
  return [...events]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(formatHirePaymentRowEvent);
}

/** Merge status events and discounts into one chronological history list. */
export function mergeHirePaymentRowHistory(input: {
  events: HirePaymentRowEventInput[];
  discounts: HirePaymentDiscountHistoryInput[];
}): HirePaymentRowEventDisplay[] {
  const items = [
    ...formatHirePaymentRowEvents(input.events),
    ...input.discounts.map(formatHirePaymentDiscountEvent),
  ];
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
