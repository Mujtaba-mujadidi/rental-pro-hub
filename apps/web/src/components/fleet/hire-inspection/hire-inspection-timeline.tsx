"use client";

import {
  formatHireInspectionOdometer,
  formatHireInspectionStamp,
} from "@/lib/fleet/hire-inspection-display";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";

export type HireInspectionTimelineCheckout = {
  completedAt: string | null;
  odometerMiles: number | null;
  fuelLevelPercent: number | null;
};

export function HireInspectionTimeline({
  contractEnded,
  checkout,
  checkinCompleted,
  audience = "staff",
}: {
  contractEnded: boolean;
  checkout: HireInspectionTimelineCheckout | null;
  checkinCompleted: boolean;
  audience?: "staff" | "driver";
}) {
  const checkoutComplete = checkout != null;

  const checkoutDetail = checkoutComplete
    ? [
        formatHireInspectionStamp(checkout.completedAt),
        checkout.odometerMiles != null
          ? `Odometer ${formatHireInspectionOdometer(checkout.odometerMiles)}`
          : null,
        checkout.fuelLevelPercent != null
          ? `Fuel ${formatHireFuelLevelPercent(checkout.fuelLevelPercent)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : audience === "driver"
      ? "Complete checkout to record vehicle condition at handover."
      : "Complete checkout to record the vehicle condition at handover.";

  const nextStepTitle = checkinCompleted ? "Check-in completed" : "Vehicle check-in";
  const nextStepDetail = checkinCompleted
    ? audience === "driver"
      ? "Return inspection and settlement are complete."
      : "Return inspection and settlement are complete."
    : contractEnded
      ? audience === "driver"
        ? "Complete check-in when you return the vehicle."
        : "Complete check-in when the driver returns the vehicle."
      : audience === "driver"
        ? "Created as part of the end-hire process. The comparison view appears after check-in is completed."
        : "Created as part of the end-hire process. The comparison view appears after check-in is completed.";

  return (
    <div className="hire-ws-inspection-timeline">
      <section className="hire-ws-inspection-checkout-card">
        <div className="hire-ws-inspection-checkout-row">
          <span
            className={
              checkoutComplete
                ? "hire-ws-inspection-timeline-icon hire-ws-inspection-timeline-icon-done"
                : "hire-ws-inspection-timeline-icon hire-ws-inspection-timeline-icon-upcoming"
            }
            aria-hidden
          >
            {checkoutComplete ? <CheckIcon /> : "1"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-rph-fg">
                {checkoutComplete ? "Vehicle checkout completed" : "Vehicle checkout"}
              </p>
              {checkoutComplete ? (
                <span className="hire-ws-chip hire-ws-chip-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  Completed
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-rph-fg-secondary">{checkoutDetail}</p>
          </div>
        </div>
      </section>

      {!checkinCompleted ? (
        <section className="hire-ws-inspection-next-step-block">
          <p className="hire-ws-section-kicker">Next step</p>
          <div className="hire-ws-inspection-next-step-card">
            <p className="text-sm font-semibold text-rph-fg">{nextStepTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{nextStepDetail}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
