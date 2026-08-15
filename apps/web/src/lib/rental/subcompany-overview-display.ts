import { formatUkDateTextLong } from "@/lib/datetime/uk";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";

export type SubcompanyOverviewHealth = "healthy" | "attention";

export type SubcompanyOverviewActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "ok" | "warn";
};

export function subcompanyOverviewHealth(input: {
  openRequirementCount: number;
  vehicleAttentionCount: number;
}): SubcompanyOverviewHealth {
  if (input.openRequirementCount > 0 || input.vehicleAttentionCount > 0) return "attention";
  return "healthy";
}

export function subcompanyOverviewComplianceLabel(health: SubcompanyOverviewHealth): string {
  return health === "healthy" ? "Current" : "Needs attention";
}

export function subcompanyOverviewHealthLabel(health: SubcompanyOverviewHealth): string {
  return health === "healthy" ? "Healthy" : "Needs attention";
}

export function mapSubcompanyOverviewActivity(
  events: readonly SubcompanyAuditRow[],
  limit = 5,
): SubcompanyOverviewActivityItem[] {
  return events.slice(0, Math.max(0, limit)).map((event) => {
    const dateLabel = formatUkDateTextLong(event.created_at);
    const summary = event.summary.trim() || "Activity";
    const sep = summary.indexOf(" · ");
    const rawTitle = sep > 0 ? summary.slice(0, sep) : summary;
    const title = rawTitle.replace(/\.+$/, "").trim() || "Activity";
    const rest = sep > 0 ? summary.slice(sep + 3).replace(/\.+$/, "").trim() : "";
    const detail = rest ? `${rest} · ${dateLabel}` : dateLabel;
    return {
      id: event.id,
      title,
      detail,
      tone: activityTone(event.event_type, title),
    };
  });
}

function activityTone(
  eventType: SubcompanyAuditRow["event_type"],
  title: string,
): "info" | "ok" | "warn" {
  const t = title.toLowerCase();
  if (eventType === "deactivated" || /\bdeactivat|\boverdue\b/.test(t)) return "warn";
  if (
    eventType === "created" ||
    eventType === "contracts_impact_answered" ||
    /\bcompleted\b|\bsigned\b|\bapproved\b/.test(t)
  ) {
    return "ok";
  }
  return "info";
}
