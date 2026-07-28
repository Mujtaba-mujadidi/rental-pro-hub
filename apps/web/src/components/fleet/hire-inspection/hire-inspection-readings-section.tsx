"use client";

import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  formatAccessoryPresence,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
  type HireInspectionAccessoryKey,
} from "@/lib/fleet/hire-inspection-accessories";
import {
  clampHireFuelLevelPercent,
  formatHireFuelLevelPercent,
  hireFuelLevelSliderStyle,
} from "@/lib/fleet/hire-fuel-level";

import type { HireInspectionKind } from "@/lib/fleet/vehicle-damage-panels";

type HireInspectionReadingsSectionProps = {
  kind?: HireInspectionKind;
  odometer: string;
  onOdometerChange: (value: string) => void;
  fuelLevel: number | null;
  onFuelLevelChange: (value: number | null) => void;
  accessories: HireInspectionAccessories;
  onAccessoryChange: (key: HireInspectionAccessoryKey, value: boolean | null) => void;
  trackerOdometerMiles: number | null;
  trackerLinked: boolean;
  trackerLoading: boolean;
  trackerLiveUnavailable?: boolean;
  trackerError?: string | null;
  readOnly?: boolean;
};

const ACCESSORY_OPTIONS = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "—", value: null },
] as const;

const FUEL_TICKS = [0, 25, 50, 75, 100] as const;

function FuelLevelSlider({
  fuelLevel,
  onFuelLevelChange,
  readOnly,
}: {
  fuelLevel: number | null;
  onFuelLevelChange: (value: number | null) => void;
  readOnly: boolean;
}) {
  const sliderValue = fuelLevel ?? 50;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-rph-fg-secondary">Fuel level</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums text-rph-fg">
            {formatHireFuelLevelPercent(fuelLevel)}
          </span>
          {!readOnly && fuelLevel != null ? (
            <button
              type="button"
              className="text-xs text-rph-link hover:text-rph-link-hover"
              onClick={() => onFuelLevelChange(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {readOnly ? null : (
        <>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            onChange={(e) => onFuelLevelChange(clampHireFuelLevelPercent(Number(e.target.value)))}
            className={`hire-fuel-level-slider w-full ${fuelLevel == null ? "opacity-70" : ""}`}
            style={hireFuelLevelSliderStyle(sliderValue)}
            aria-label="Fuel level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fuelLevel ?? undefined}
            aria-valuetext={formatHireFuelLevelPercent(fuelLevel)}
          />
          <div className="flex justify-between text-[10px] text-rph-fg-muted">
            {FUEL_TICKS.map((tick) => (
              <span key={tick}>{tick}%</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HireInspectionReadingsSection({
  kind,
  odometer,
  onOdometerChange,
  fuelLevel,
  onFuelLevelChange,
  accessories,
  onAccessoryChange,
  trackerOdometerMiles,
  trackerLinked,
  trackerLoading,
  trackerLiveUnavailable = false,
  trackerError = null,
  readOnly = false,
}: HireInspectionReadingsSectionProps) {
  const inspectionLabel = kind === "checkin" ? "check-in" : kind === "checkout" ? "checkout" : "inspection";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-rph-fg-secondary">Odometer</label>
          <div className="relative">
            <input
              className="rph-input pr-10"
              type="number"
              min={0}
              placeholder="Mileage"
              value={odometer}
              onChange={(e) => onOdometerChange(e.target.value)}
              disabled={readOnly}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-rph-fg-muted">
              mi
            </span>
          </div>
        {trackerLoading ? (
          <p className="rph-muted flex items-center gap-2 text-xs">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
            Loading tracker…
          </p>
        ) : trackerError ? (
          <p className="rph-alert-error text-xs">{trackerError}</p>
        ) : trackerLinked ? (
          <div className="space-y-1 text-xs text-rph-fg-muted">
            <p>
              Tracker:{" "}
              {trackerOdometerMiles != null
                ? `${Math.round(trackerOdometerMiles)} mi`
                : trackerLiveUnavailable
                  ? "live mileage unavailable"
                  : "—"}
              {!readOnly ? " · manual entry updates tracker on save if different" : null}
            </p>
            {!readOnly ? (
              <p className="text-rph-fg-secondary">
                {trackerOdometerMiles != null
                  ? `Pre-filled from tracker for ${inspectionLabel}. Read and confirm mileage on the dashboard before saving.`
                  : `Tracker linked but live mileage is unavailable. Enter mileage from the dashboard for ${inspectionLabel}.`}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rph-muted text-xs">No tracker linked</p>
        )}
        </div>

        <FuelLevelSlider
          fuelLevel={fuelLevel}
          onFuelLevelChange={onFuelLevelChange}
          readOnly={readOnly}
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
          Vehicle kit
        </h3>
        <div className="overflow-hidden rounded-lg border border-rph-border">
          {HIRE_INSPECTION_ACCESSORY_KEYS.map((key, index) => (
            <div
              key={key}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${
                index > 0 ? "border-t border-rph-border" : ""
              }`}
            >
              <span className="text-sm text-rph-fg">{hireInspectionAccessoryLabel(key)}</span>
              {readOnly ? (
                <span className="text-xs text-rph-fg-secondary">
                  {formatAccessoryPresence(accessories[key])}
                </span>
              ) : (
                <div className="inline-flex rounded-md border border-rph-border bg-rph-chrome p-0.5">
                  {ACCESSORY_OPTIONS.map((option) => {
                    const selected = accessories[key] === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        className={`min-w-[2.25rem] rounded px-2 py-0.5 text-xs transition-colors ${
                          selected
                            ? "bg-rph-raised text-rph-fg shadow-sm"
                            : "text-rph-fg-muted hover:text-rph-fg-secondary"
                        }`}
                        onClick={() => onAccessoryChange(key, option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
