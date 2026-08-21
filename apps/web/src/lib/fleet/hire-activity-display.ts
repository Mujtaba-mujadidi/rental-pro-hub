import { formatUkDateText, formatUkDateTimeText } from "@/lib/datetime/uk";
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
