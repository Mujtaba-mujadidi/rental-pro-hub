"use client";

import {
  formatHireInspectionDateOnly,
  formatHireInspectionOdometer,
  formatHireInspectionTimeOnly,
} from "@/lib/fleet/hire-inspection-display";
import { formatHireFuelLevelPercent, clampHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";

export function HireInspectionVehicleMetrics({
  odometerMiles,
  fuelLevelPercent,
  completedAt,
  trackerLinked,
  recordedAtLabel = "Recorded at checkout",
}: {
  odometerMiles: number | null;
  fuelLevelPercent: number | null;
  completedAt: string | null;
  trackerLinked: boolean;
  recordedAtLabel?: string;
}) {
  const fuelPercent = fuelLevelPercent != null ? clampHireFuelLevelPercent(fuelLevelPercent) : null;

  return (
    <div className="hire-ws-inspection-metric-grid">
      <div className="hire-ws-inspection-metric">
        <p className="hire-ws-section-kicker">Odometer</p>
        <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-rph-fg">
          {formatHireInspectionOdometer(odometerMiles)}
        </p>
        <p className="mt-1 text-xs text-rph-fg-muted">
          {trackerLinked ? "Tracker linked" : "No tracker linked"}
        </p>
      </div>

      <div className="hire-ws-inspection-metric">
        <p className="hire-ws-section-kicker">Fuel level</p>
        <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-rph-fg">
          {formatHireFuelLevelPercent(fuelLevelPercent).replace("Not recorded", "—")}
        </p>
        {fuelPercent != null ? (
          <div className="hire-ws-fuel-bar" aria-hidden>
            <div className="hire-ws-fuel-bar-fill" style={{ width: `${fuelPercent}%` }} />
          </div>
        ) : null}
        <p className="mt-1 text-xs text-rph-fg-muted">{recordedAtLabel}</p>
      </div>

      <div className="hire-ws-inspection-metric">
        <p className="hire-ws-section-kicker">Inspection time</p>
        <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-rph-fg">
          {formatHireInspectionTimeOnly(completedAt)}
        </p>
        <p className="mt-1 text-xs text-rph-fg-muted">{formatHireInspectionDateOnly(completedAt)}</p>
      </div>
    </div>
  );
}
