import { formatUkDateText } from "@/lib/datetime/uk";
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory } from "@/lib/fleet/maintenance";

export type MaintenanceSummaryRecord = {
  occurred_on: string;
  category: string;
  odometer_miles: number | null;
  description?: string | null;
};

export type LastServiceSummary = {
  occurredOn: string;
  dateLabel: string;
  odometerMiles: number | null;
  mileageHint: string;
};

export type NextServiceSummary = {
  /** Short primary figure shown large (e.g. "3,420 mi remaining"). */
  value: string;
  /** Label for the primary figure. */
  valueLabel: string;
  hint: string;
  tone: "neutral" | "success" | "warn";
};

export type EffectiveMileageSource = "tracker" | "stored" | "recorded";

export type EffectiveCurrentMileage = {
  miles: number | null;
  source: EffectiveMileageSource;
};

/** Latest maintenance row categorised as a service. */
export function findLastServiceRecord(
  records: readonly MaintenanceSummaryRecord[],
): MaintenanceSummaryRecord | null {
  let best: MaintenanceSummaryRecord | null = null;
  for (const row of records) {
    if (row.category !== "service") continue;
    if (!best || row.occurred_on > best.occurred_on) best = row;
  }
  return best;
}

/** Highest odometer logged on any maintenance record. */
export function highestRecordedOdometer(
  records: readonly MaintenanceSummaryRecord[],
): number | null {
  let best: number | null = null;
  for (const row of records) {
    if (row.odometer_miles == null || !Number.isFinite(row.odometer_miles)) continue;
    const miles = Math.round(row.odometer_miles);
    if (best == null || miles > best) best = miles;
  }
  return best;
}

/**
 * Prefer tracker only when it is not below known service/vehicle mileage.
 * A brand-new or unset tracker often reports a low reading that must not drive "miles remaining".
 */
export function resolveEffectiveCurrentMileage(input: {
  trackerMiles?: number | null;
  storedMiles?: number | null;
  recordedFloorMiles?: number | null;
}): EffectiveCurrentMileage {
  const tracker =
    input.trackerMiles != null && Number.isFinite(input.trackerMiles)
      ? Math.round(input.trackerMiles)
      : null;
  const stored =
    input.storedMiles != null && Number.isFinite(input.storedMiles)
      ? Math.round(input.storedMiles)
      : null;
  const recorded =
    input.recordedFloorMiles != null && Number.isFinite(input.recordedFloorMiles)
      ? Math.round(input.recordedFloorMiles)
      : null;

  const floorCandidates = [stored, recorded].filter((n): n is number => n != null);
  const floor = floorCandidates.length ? Math.max(...floorCandidates) : null;

  if (tracker != null && (floor == null || tracker >= floor)) {
    return { miles: tracker, source: "tracker" };
  }

  if (recorded != null && stored != null) {
    return recorded >= stored
      ? { miles: recorded, source: "recorded" }
      : { miles: stored, source: "stored" };
  }
  if (recorded != null) return { miles: recorded, source: "recorded" };
  if (stored != null) return { miles: stored, source: "stored" };
  return { miles: null, source: "stored" };
}

export function mileageSourceHint(source: EffectiveMileageSource): string {
  if (source === "tracker") return "From tracker";
  if (source === "recorded") return "From maintenance records (tracker reading looked too low)";
  return "Stored on vehicle";
}

/** Compact KPI date: `18 Jun` (year omitted to match the Maintenance summary tiles). */
export function formatServiceDayMonth(value: string): string {
  return formatUkDateText(value).replace(/\s+\d{4}$/, "");
}

export function buildLastServiceSummary(
  records: readonly MaintenanceSummaryRecord[],
): LastServiceSummary | null {
  const last = findLastServiceRecord(records);
  if (!last) return null;
  const miles = last.odometer_miles;
  return {
    occurredOn: last.occurred_on,
    dateLabel: formatServiceDayMonth(last.occurred_on),
    odometerMiles: miles,
    mileageHint: miles != null ? `At ${formatMiles(miles)} miles` : "Mileage not recorded",
  };
}

export function milesRemainingToNextService(
  currentMileage: number | null | undefined,
  nextServiceMileage: number | null | undefined,
): number | null {
  if (currentMileage == null || nextServiceMileage == null) return null;
  if (!Number.isFinite(currentMileage) || !Number.isFinite(nextServiceMileage)) return null;
  return Math.round(nextServiceMileage - currentMileage);
}

export function buildNextServiceSummary(input: {
  serviceDueAt: string | null | undefined;
  nextServiceMileage: number | null | undefined;
  currentMileage: number | null | undefined;
  todayYmd: string;
}): NextServiceSummary {
  const dueAt = input.serviceDueAt?.trim() || null;
  const nextMiles = input.nextServiceMileage ?? null;
  const remaining = milesRemainingToNextService(input.currentMileage, nextMiles);

  if (remaining != null) {
    const overdue = remaining <= 0;
    return {
      valueLabel: overdue ? "Service status" : "Miles remaining",
      value: overdue ? "Due now" : `${formatMiles(remaining)} mi`,
      hint: dueAt
        ? `Due ${formatUkDateText(dueAt)} · target ${formatMiles(nextMiles!)} mi`
        : `Target ${formatMiles(nextMiles!)} miles`,
      tone: overdue || (dueAt != null && dueAt <= input.todayYmd) ? "warn" : "success",
    };
  }

  if (nextMiles != null) {
    const dueSoon = dueAt != null && dueAt <= input.todayYmd;
    return {
      valueLabel: "Due at mileage",
      value: `${formatMiles(nextMiles)} mi`,
      hint: dueAt ? `Due ${formatUkDateText(dueAt)}` : "Current mileage not available yet",
      tone: dueSoon ? "warn" : "neutral",
    };
  }

  if (dueAt) {
    return {
      valueLabel: "Due date",
      value: formatUkDateText(dueAt),
      hint: dueAt <= input.todayYmd ? "Service due date reached" : "No mileage target set",
      tone: dueAt <= input.todayYmd ? "warn" : "success",
    };
  }

  return {
    valueLabel: "Next service",
    value: "—",
    hint: "Set on the next service log",
    tone: "neutral",
  };
}

export function formatMiles(value: number): string {
  return Math.round(value).toLocaleString("en-GB");
}

export function maintenanceTypeLabel(category: string, description?: string | null): {
  primary: string;
  secondary: string | null;
} {
  const primary =
    MAINTENANCE_CATEGORY_LABELS[category as MaintenanceCategory] ??
    category.replace(/_/g, " ");
  const secondary = description?.trim() || null;
  return { primary, secondary };
}
