import { formatUkDate, formatUkDateRange, formatUkDateText, formatUkDateTimeText } from "@/lib/datetime/uk";
import {
  HIRE_GROUP_EVENT_TYPES,
  formatAuditActorLabel,
  hireAuditActorRoleLabel,
  type HireAuditActorRole,
  type HireGroupAuditRow,
  type HireGroupEventType,
} from "@/lib/fleet/hire-audit";

export type HireActivityKind = "payment" | "charge" | "inspection" | "status" | "warn" | "neutral";

export type HireActivityItem = {
  id: string;
  eventType: string;
  title: string;
  description: string;
  dateLabel: string;
  timeLabel: string;
  timestampLabel: string;
  kind: HireActivityKind;
  recordedByLabel: string | null;
};

const HIRE_ACTIVITY_TITLES: Record<HireGroupEventType, string> = {
  draft_created: "Hire draft created",
  draft_step_saved: "Hire draft updated",
  driver_access_requested: "Driver access requested",
  driver_access_email_sent: "Driver access email sent",
  driver_access_approved: "Driver access approved",
  driver_access_rejected: "Driver access rejected",
  driver_profile_confirmed: "Driver profile confirmed",
  hire_contract_amended: "Hire contract amended",
  contracts_finalized: "Contracts finalized",
  vehicle_status_synced: "Vehicle status updated",
  esign_prepared: "Signature pack prepared",
  esign_completed: "Agreement signed",
  hire_status_changed: "Hire status updated",
  hire_cancelled: "Hire cancelled",
  hire_reprepared_for_signature: "Contracts prepared for signature",
  hire_pdfs_refreshed: "Contract PDFs refreshed",
  hire_signing_bundle_sent: "Signing pack sent",
  hire_signing_bundle_resent: "Signing pack resent",
  checkout_started: "Vehicle check-out started",
  checkout_completed: "Vehicle checked out",
  checkin_started: "Vehicle check-in started",
  checkin_completed: "Vehicle checked in",
  hire_terminated: "Hire ended",
  deposit_disposition_resolved: "Deposit decision recorded",
  deposit_refund_recorded: "Deposit refund recorded",
  settlement_refund_recorded: "Refund recorded",
  settlement_discount_recorded: "Settlement discount recorded",
  driver_charge_added: "Extra charge added",
  driver_charge_amended: "Extra charge amended",
  driver_charge_voided: "Extra charge voided",
  driver_charge_removed: "Extra charge removed",
  driver_charge_payment_submitted: "Extra charge payment submitted",
  driver_charge_payment_approved: "Extra charge payment approved",
  driver_charge_payment_rejected: "Extra charge payment rejected",
  driver_charge_payment_recorded: "Extra charge payment recorded",
  driver_charge_payment_amended: "Extra charge payment amended",
  schedule_payment_submitted: "Schedule payment submitted",
  schedule_payment_recorded: "Schedule payment recorded",
  schedule_payment_approved: "Schedule payment approved",
  schedule_payment_rejected: "Schedule payment rejected",
  schedule_payment_amended: "Schedule payment amended",
  schedule_discount_changed: "Schedule discount updated",
  settlement_balance_payment_recorded: "Settlement payment recorded",
};

const HIRE_ACTIVITY_KINDS: Record<HireGroupEventType, HireActivityKind> = {
  draft_created: "neutral",
  draft_step_saved: "neutral",
  driver_access_requested: "neutral",
  driver_access_email_sent: "neutral",
  driver_access_approved: "status",
  driver_access_rejected: "warn",
  driver_profile_confirmed: "status",
  hire_contract_amended: "warn",
  contracts_finalized: "status",
  vehicle_status_synced: "neutral",
  esign_prepared: "neutral",
  esign_completed: "status",
  hire_status_changed: "status",
  hire_cancelled: "warn",
  hire_reprepared_for_signature: "neutral",
  hire_pdfs_refreshed: "neutral",
  hire_signing_bundle_sent: "neutral",
  hire_signing_bundle_resent: "neutral",
  checkout_started: "inspection",
  checkout_completed: "inspection",
  checkin_started: "inspection",
  checkin_completed: "inspection",
  hire_terminated: "status",
  deposit_disposition_resolved: "payment",
  deposit_refund_recorded: "payment",
  settlement_refund_recorded: "payment",
  settlement_discount_recorded: "payment",
  driver_charge_added: "charge",
  driver_charge_amended: "charge",
  driver_charge_voided: "charge",
  driver_charge_removed: "charge",
  driver_charge_payment_submitted: "payment",
  driver_charge_payment_approved: "payment",
  driver_charge_payment_rejected: "warn",
  driver_charge_payment_recorded: "payment",
  driver_charge_payment_amended: "payment",
  schedule_payment_submitted: "payment",
  schedule_payment_recorded: "payment",
  schedule_payment_approved: "payment",
  schedule_payment_rejected: "warn",
  schedule_payment_amended: "payment",
  schedule_discount_changed: "payment",
  settlement_balance_payment_recorded: "payment",
};

/** Events a driver may see on their hire activity timeline. */
export const DRIVER_HIRE_ACTIVITY_EVENT_TYPES = new Set<HireGroupEventType>([
  "driver_access_approved",
  "contracts_finalized",
  "esign_completed",
  "hire_status_changed",
  "hire_cancelled",
  "checkout_started",
  "checkout_completed",
  "checkin_started",
  "checkin_completed",
  "hire_terminated",
  "deposit_disposition_resolved",
  "deposit_refund_recorded",
  "settlement_refund_recorded",
  "settlement_discount_recorded",
  "driver_charge_added",
  "driver_charge_amended",
  "driver_charge_voided",
  "driver_charge_removed",
  "driver_charge_payment_submitted",
  "driver_charge_payment_approved",
  "driver_charge_payment_rejected",
  "driver_charge_payment_recorded",
  "driver_charge_payment_amended",
  "schedule_payment_submitted",
  "schedule_payment_recorded",
  "schedule_payment_approved",
  "schedule_payment_rejected",
  "schedule_payment_amended",
  "schedule_discount_changed",
  "settlement_balance_payment_recorded",
]);

export function isHireGroupEventType(value: string): value is HireGroupEventType {
  return (HIRE_GROUP_EVENT_TYPES as readonly string[]).includes(value);
}

export function hireActivityActorRoleLabel(role: HireAuditActorRole | string | null | undefined): string {
  return hireAuditActorRoleLabel(role);
}

export function hireActivityTitle(eventType: string): string {
  if (isHireGroupEventType(eventType)) return HIRE_ACTIVITY_TITLES[eventType];
  return eventType.replace(/_/g, " ");
}

export function hireActivityKind(eventType: string): HireActivityKind {
  if (isHireGroupEventType(eventType)) return HIRE_ACTIVITY_KINDS[eventType];
  return "neutral";
}

function splitUkDateTimeText(value: string): { dateLabel: string; timeLabel: string } {
  const comma = value.lastIndexOf(", ");
  if (comma < 0) return { dateLabel: value, timeLabel: "" };
  return { dateLabel: value.slice(0, comma), timeLabel: value.slice(comma + 2) };
}

export type ExtraChargeBalancePaymentActivityInput = {
  id: string;
  amountGbp: number;
  paidAt: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  recordedByUserId?: string | null;
};

function loggedExtraChargeBalancePaymentIds(events: readonly HireGroupAuditRow[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    const paymentId = event.metadata?.balancePaymentId;
    if (typeof paymentId === "string" && paymentId.trim()) ids.add(paymentId.trim());
  }
  return ids;
}

/** Backfill activity rows for staff-recorded extra-charge receipts missing audit events. */
export function synthesizeExtraChargePaymentActivityEvents(
  events: readonly HireGroupAuditRow[],
  payments: readonly ExtraChargeBalancePaymentActivityInput[],
): HireGroupAuditRow[] {
  const loggedPaymentIds = loggedExtraChargeBalancePaymentIds(events);
  const synthesized: HireGroupAuditRow[] = [];

  for (const payment of payments) {
    const amountGbp = Number(payment.amountGbp);
    if (!Number.isFinite(amountGbp) || amountGbp <= 0) continue;
    if (loggedPaymentIds.has(payment.id)) continue;

    synthesized.push({
      id: `balance-payment:${payment.id}`,
      event_type: "driver_charge_payment_recorded",
      actor_user_id: payment.recordedByUserId?.trim() || null,
      actor_role: "company_staff",
      summary: `Recorded £${amountGbp.toFixed(2)} against extra charges.`,
      metadata: {
        balancePaymentId: payment.id,
        amountGbp,
        paymentMethod: payment.paymentMethod ?? null,
        paymentReference: payment.paymentReference?.trim() || null,
        synthesizedFromBalancePayment: true,
      },
      created_at: payment.paidAt,
    });
  }

  return synthesized.length ? [...events, ...synthesized] : [...events];
}


export type SchedulePaymentStatusActivityInput = {
  id: string;
  scheduleRowId: string;
  rowKind: "deposit" | "rent";
  periodStart: string;
  periodEnd: string;
  eventKind: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  amendmentPayload: Record<string, unknown> | null;
  actorUserId: string | null;
  actorRole: "company_staff" | "driver" | "system";
  createdAt: string;
};

function scheduleRowActivityLabel(input: {
  rowKind: "deposit" | "rent";
  periodStart: string;
  periodEnd: string;
}): string {
  if (input.rowKind === "deposit") return "Deposit";
  if (input.periodStart && input.periodEnd && input.periodStart !== input.periodEnd) {
    return formatUkDateRange(input.periodStart, input.periodEnd);
  }
  if (input.periodStart) return formatUkDate(input.periodStart);
  return "Rent period";
}

function loggedSchedulePaymentStatusEventIds(events: readonly HireGroupAuditRow[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    const eventId = event.metadata?.paymentStatusEventId;
    if (typeof eventId === "string" && eventId.trim()) ids.add(eventId.trim());
  }
  return ids;
}

function hasNearMatchLoggedScheduleActivity(
  events: readonly HireGroupAuditRow[],
  statusEvent: SchedulePaymentStatusActivityInput,
  mappedType: HireGroupEventType,
): boolean {
  const statusMs = Date.parse(statusEvent.createdAt);
  if (!Number.isFinite(statusMs)) return false;
  for (const event of events) {
    if (event.metadata?.synthesizedFromPaymentStatusEvent === true) continue;
    if (event.event_type !== mappedType) continue;
    if (event.metadata?.scheduleRowId !== statusEvent.scheduleRowId) continue;
    const eventMs = Date.parse(event.created_at);
    if (Number.isFinite(eventMs) && Math.abs(eventMs - statusMs) <= 5000) return true;
  }
  return false;
}

function mapScheduleStatusEventToActivity(
  event: SchedulePaymentStatusActivityInput,
): { eventType: HireGroupEventType; summary: string } | null {
  const label = scheduleRowActivityLabel(event);
  const payload = event.amendmentPayload ?? {};
  const amount =
    Number(
      payload.submittedAmountGbp ??
        payload.approvedAmountGbp ??
        payload.newApprovedAmountGbp ??
        payload.newDiscountGbp ??
        NaN,
    );

  if (event.eventKind === "amendment" && payload.discountChange === true) {
    const next = Number(payload.newDiscountGbp);
    const prev = Number(payload.previousDiscountGbp);
    const nextText = Number.isFinite(next) ? `£${next.toFixed(2)}` : "updated";
    const prevText = Number.isFinite(prev) ? `£${prev.toFixed(2)}` : null;
    return {
      eventType: "schedule_discount_changed",
      summary: prevText
        ? `Discount on ${label} changed from ${prevText} to ${nextText}.`
        : `Discount on ${label} set to ${nextText}.`,
    };
  }

  if (event.eventKind === "amendment" || (event.fromStatus === "approved" && event.toStatus === "approved")) {
    const next = Number(payload.newApprovedAmountGbp);
    const prev = Number(payload.previousApprovedAmountGbp);
    if (Number.isFinite(next)) {
      return {
        eventType: "schedule_payment_amended",
        summary: Number.isFinite(prev)
          ? `Amended ${label} payment from £${prev.toFixed(2)} to £${next.toFixed(2)}.`
          : `Amended ${label} payment to £${next.toFixed(2)}.`,
      };
    }
  }

  if (event.toStatus === "pending_approval") {
    const amountText = Number.isFinite(amount) ? `£${amount.toFixed(2)}` : "a payment";
    return {
      eventType: "schedule_payment_submitted",
      summary: `Submitted ${amountText} for ${label}.`,
    };
  }

  if (event.toStatus === "rejected") {
    const reason = event.comment?.trim();
    return {
      eventType: "schedule_payment_rejected",
      summary: reason ? `Rejected ${label} payment: ${reason}` : `Rejected ${label} payment.`,
    };
  }

  if (event.toStatus === "approved") {
    const amountText = Number.isFinite(amount) ? `£${amount.toFixed(2)}` : null;
    const direct = payload.directRowPayment === true || payload.paymentMethod != null;
    if (event.fromStatus === "not_received" || event.fromStatus === "rejected" || direct) {
      return {
        eventType: "schedule_payment_recorded",
        summary: amountText
          ? `Recorded ${amountText} for ${label}.`
          : `Recorded payment for ${label}.`,
      };
    }
    return {
      eventType: "schedule_payment_approved",
      summary: amountText
        ? `Approved ${amountText} for ${label}.`
        : `Approved payment for ${label}.`,
    };
  }

  if (event.toStatus === "not_received" && event.fromStatus === "approved") {
    return {
      eventType: "schedule_payment_amended",
      summary: `Cleared approved payment on ${label}.`,
    };
  }

  return null;
}

/** Backfill Activity from schedule payment status events that were never written to group events. */
export function synthesizeSchedulePaymentActivityEvents(
  events: readonly HireGroupAuditRow[],
  statusEvents: readonly SchedulePaymentStatusActivityInput[],
): HireGroupAuditRow[] {
  const loggedIds = loggedSchedulePaymentStatusEventIds(events);
  const synthesized: HireGroupAuditRow[] = [];

  for (const statusEvent of statusEvents) {
    if (loggedIds.has(statusEvent.id)) continue;
    const mapped = mapScheduleStatusEventToActivity(statusEvent);
    if (!mapped) continue;
    if (hasNearMatchLoggedScheduleActivity(events, statusEvent, mapped.eventType)) continue;
    synthesized.push({
      id: `payment-status:${statusEvent.id}`,
      event_type: mapped.eventType,
      actor_user_id: statusEvent.actorUserId,
      actor_role: statusEvent.actorRole,
      summary: mapped.summary,
      metadata: {
        paymentStatusEventId: statusEvent.id,
        scheduleRowId: statusEvent.scheduleRowId,
        rowKind: statusEvent.rowKind,
        periodStart: statusEvent.periodStart,
        periodEnd: statusEvent.periodEnd,
        fromStatus: statusEvent.fromStatus,
        toStatus: statusEvent.toStatus,
        eventKind: statusEvent.eventKind,
        synthesizedFromPaymentStatusEvent: true,
      },
      created_at: statusEvent.createdAt,
    });
  }

  return synthesized.length ? [...events, ...synthesized] : [...events];
}

export type SettlementBalancePaymentActivityInput = {
  id: string;
  amountGbp: number;
  paidAt: string;
  direction: "received_from_driver" | "paid_to_driver" | string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  recordedByUserId?: string | null;
};

function loggedSettlementBalancePaymentIds(events: readonly HireGroupAuditRow[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "settlement_balance_payment_recorded") continue;
    const paymentId = event.metadata?.balancePaymentId;
    if (typeof paymentId === "string" && paymentId.trim()) ids.add(paymentId.trim());
  }
  return ids;
}

/** Backfill Activity for settlement balance payments missing group audit events. */
export function synthesizeSettlementBalancePaymentActivityEvents(
  events: readonly HireGroupAuditRow[],
  payments: readonly SettlementBalancePaymentActivityInput[],
): HireGroupAuditRow[] {
  const loggedPaymentIds = loggedSettlementBalancePaymentIds(events);
  const synthesized: HireGroupAuditRow[] = [];

  for (const payment of payments) {
    const amountGbp = Number(payment.amountGbp);
    if (!Number.isFinite(amountGbp) || amountGbp <= 0) continue;
    if (loggedPaymentIds.has(payment.id)) continue;

    const directionLabel =
      payment.direction === "paid_to_driver" ? "paid to driver" : "received from driver";

    synthesized.push({
      id: `settlement-balance-payment:${payment.id}`,
      event_type: "settlement_balance_payment_recorded",
      actor_user_id: payment.recordedByUserId?.trim() || null,
      actor_role: "company_staff",
      summary: `Recorded £${amountGbp.toFixed(2)} settlement payment ${directionLabel}.`,
      metadata: {
        balancePaymentId: payment.id,
        amountGbp,
        direction: payment.direction,
        paymentMethod: payment.paymentMethod ?? null,
        paymentReference: payment.paymentReference?.trim() || null,
        synthesizedFromBalancePayment: true,
      },
      created_at: payment.paidAt,
    });
  }

  return synthesized.length ? [...events, ...synthesized] : [...events];
}

export function buildHireActivityItems(
  events: HireGroupAuditRow[],
  options: {
    audience: "staff" | "driver";
    actorNames?: Record<string, string | null | undefined>;
  },
): HireActivityItem[] {
  const rows = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const items: HireActivityItem[] = [];

  for (const event of rows) {
    if (options.audience === "driver" && !DRIVER_HIRE_ACTIVITY_EVENT_TYPES.has(event.event_type)) {
      continue;
    }

    const timestampLabel = formatUkDateTimeText(event.created_at);
    const split = splitUkDateTimeText(timestampLabel);
    const dateLabel = formatUkDateText(event.created_at);
    const actorName =
      (event.actor_user_id ? options.actorNames?.[event.actor_user_id]?.trim() || null : null) ||
      event.actor_display_name?.trim() ||
      null;

    items.push({
      id: event.id,
      eventType: event.event_type,
      title: hireActivityTitle(event.event_type),
      description: event.summary.trim() || hireActivityTitle(event.event_type),
      dateLabel,
      timeLabel: split.timeLabel,
      timestampLabel,
      kind: hireActivityKind(event.event_type),
      recordedByLabel:
        options.audience === "staff"
          ? `Recorded by ${formatAuditActorLabel(actorName, event.actor_role)}`
          : null,
    });
  }

  return items;
}

function csvSafeText(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A3/g, "GBP ")
    .replace(/[^\t\n\r\x20-\x7E]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function csvCell(value: string): string {
  const text = csvSafeText(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildHireActivityExportCsv(items: HireActivityItem[], audience: "staff" | "driver"): string {
  const header =
    audience === "staff"
      ? ["Date", "Time", "Title", "Description", "Recorded by"]
      : ["Date", "Time", "Title", "Description"];
  const lines = [header.map(csvCell).join(",")];
  for (const item of items) {
    const row = [item.dateLabel, item.timeLabel, item.title, item.description];
    if (audience === "staff") row.push(item.recordedByLabel ?? "");
    lines.push(row.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function hireActivityExportFileName(hireGroupId: string): string {
  const slug = hireGroupId.trim().slice(0, 8) || "hire";
  return `hire-activity-${slug}.csv`;
}
