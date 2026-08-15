import {
  formatUkDateTextLong,
  formatUkTime,
  ukLondonDayYmd,
  ukTodayYmd,
} from "@/lib/datetime/uk";
import type { SubcompanyAuditRow, SubcompanyEventType } from "@/lib/rental/subcompany-audit";

export type SubcompanyActivityTone = "info" | "ok" | "warn" | "neutral";

export type SubcompanyActivityFilter = "all" | SubcompanyEventType;

export type SubcompanyActivityItem = {
  id: string;
  eventType: SubcompanyEventType;
  title: string;
  detail: string;
  timeLabel: string;
  dayKey: string;
  dayLabel: string;
  tone: SubcompanyActivityTone;
  actorLabel: string | null;
};

export type SubcompanyActivityDayGroup = {
  dayKey: string;
  dayLabel: string;
  items: SubcompanyActivityItem[];
};

export const SUBCOMPANY_ACTIVITY_FILTERS: Array<{
  value: SubcompanyActivityFilter;
  label: string;
}> = [
  { value: "all", label: "All activity" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Field updates" },
  { value: "logo_changed", label: "Logo changes" },
  { value: "deactivated", label: "Deactivations" },
  { value: "contracts_impact_answered", label: "Contract impact" },
];

export function subcompanyActivityTone(
  eventType: SubcompanyEventType,
  title: string,
): SubcompanyActivityTone {
  const t = title.toLowerCase();
  if (eventType === "deactivated" || /\bdeactivat|\boverdue\b|\breminder\b|\bmot\b/.test(t)) {
    return "warn";
  }
  if (
    eventType === "created" ||
    eventType === "contracts_impact_answered" ||
    /\bcompleted\b|\bsigned\b|\bapproved\b/.test(t)
  ) {
    return "ok";
  }
  if (/\benabled\b|\baccess\b/.test(t)) return "info";
  if (/\bassigned\b|\bupdated\b|\blogo\b/.test(t) || eventType === "logo_changed" || eventType === "updated") {
    return "neutral";
  }
  return "info";
}

export function splitSubcompanyActivitySummary(summary: string): { title: string; rest: string } {
  const raw = summary.trim() || "Activity";
  const sep = raw.indexOf(" · ");
  const rawTitle = sep > 0 ? raw.slice(0, sep) : raw;
  const title = rawTitle.replace(/\.+$/, "").trim() || "Activity";
  const rest = sep > 0 ? raw.slice(sep + 3).replace(/\.+$/, "").trim() : "";
  return { title, rest };
}

function actorRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  if (role === "company_staff") return "Rental staff";
  if (role === "driver") return "Driver";
  if (role === "system") return "System";
  return role.replace(/_/g, " ");
}

export function mapSubcompanyActivityItem(event: SubcompanyAuditRow): SubcompanyActivityItem {
  const { title, rest } = splitSubcompanyActivitySummary(event.summary);
  const dayKey = ukLondonDayYmd(event.created_at) ?? event.created_at.slice(0, 10);
  const today = ukTodayYmd();
  const dayLabel =
    dayKey === today ? "TODAY" : formatUkDateTextLong(event.created_at).toUpperCase();
  const name = event.actor_display_name?.trim() || null;
  const role = actorRoleLabel(event.actor_role);
  const actorLabel = name ? (role ? `${name} · ${role}` : name) : role;

  return {
    id: event.id,
    eventType: event.event_type,
    title,
    detail: rest,
    timeLabel: formatUkTime(event.created_at),
    dayKey,
    dayLabel,
    tone: subcompanyActivityTone(event.event_type, title),
    actorLabel,
  };
}

export function mapSubcompanyActivityItems(
  events: readonly SubcompanyAuditRow[],
): SubcompanyActivityItem[] {
  return events.map(mapSubcompanyActivityItem);
}

export function filterSubcompanyActivityItems(
  items: readonly SubcompanyActivityItem[],
  filter: SubcompanyActivityFilter,
): SubcompanyActivityItem[] {
  if (filter === "all") return [...items];
  return items.filter((item) => item.eventType === filter);
}

export function groupSubcompanyActivityByDay(
  items: readonly SubcompanyActivityItem[],
): SubcompanyActivityDayGroup[] {
  const groups: SubcompanyActivityDayGroup[] = [];
  const byKey = new Map<string, SubcompanyActivityDayGroup>();
  for (const item of items) {
    let group = byKey.get(item.dayKey);
    if (!group) {
      group = { dayKey: item.dayKey, dayLabel: item.dayLabel, items: [] };
      byKey.set(item.dayKey, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export function buildSubcompanyActivityExportCsv(items: readonly SubcompanyActivityItem[]): string {
  const header = ["Date", "Time", "Title", "Detail", "Actor", "Event type"];
  const lines = [header.map(csvCell).join(",")];
  for (const item of items) {
    lines.push(
      [
        item.dayLabel === "TODAY" ? ukTodayYmd() : item.dayKey,
        item.timeLabel,
        item.title,
        item.detail,
        item.actorLabel ?? "",
        item.eventType,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function subcompanyActivityExportFileName(subcompanyId: string): string {
  return `subcompany-activity-${subcompanyId.slice(0, 8)}-${ukTodayYmd()}.csv`;
}

function csvCell(value: string): string {
  const safe = value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/"/g, '""');
  return `"${safe}"`;
}
