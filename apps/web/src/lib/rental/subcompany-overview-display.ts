import { formatUkDateTextLong } from "@/lib/datetime/uk";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import {
  splitSubcompanyActivitySummary,
  subcompanyActivityTone,
} from "@/lib/rental/subcompany-activity-display";

export type SubcompanyOverviewHealth = "healthy" | "attention";

export type SubcompanyOverviewActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "ok" | "warn" | "neutral";
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
    const { title, rest } = splitSubcompanyActivitySummary(event.summary);
    const detail = rest ? `${rest} · ${dateLabel}` : dateLabel;
    return {
      id: event.id,
      title,
      detail,
      tone: subcompanyActivityTone(event.event_type, title),
    };
  });
}
