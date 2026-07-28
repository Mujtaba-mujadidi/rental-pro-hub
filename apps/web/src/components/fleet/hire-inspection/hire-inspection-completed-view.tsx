"use client";

import { useState } from "react";
import { VehicleDamageDiagram } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import { HireInspectionReadingsSection } from "@/components/fleet/hire-inspection/hire-inspection-readings-section";
import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  formatAccessoryPresence,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import {
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import type { VehicleDamageDiagramEntry } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import { formatUkDateTime } from "@/lib/datetime/uk";

const TAB_LABELS = ["Vehicle", "Damage", "Photos", "Review"] as const;

type HireInspectionCompletedViewProps = {
  kind: HireInspectionKind;
  data: HireInspectionPayload;
  diagramDamages: VehicleDamageDiagramEntry[];
  odometer: string;
  fuelLevel: number | null;
  accessories: HireInspectionAccessories;
  generalNotes: string;
};

export function HireInspectionCompletedView({
  kind,
  data,
  diagramDamages,
  odometer,
  fuelLevel,
  accessories,
  generalNotes,
}: HireInspectionCompletedViewProps) {
  const [tab, setTab] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TAB_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`rph-pill ${tab === index ? "rph-pill-active" : ""}`}
            onClick={() => setTab(index)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 ? (
        <section className="rph-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-rph-fg">Vehicle readings</h2>
          <HireInspectionReadingsSection
            odometer={odometer}
            onOdometerChange={() => {}}
            fuelLevel={fuelLevel}
            onFuelLevelChange={() => {}}
            accessories={accessories}
            onAccessoryChange={() => {}}
            trackerOdometerMiles={null}
            trackerLinked={false}
            trackerLoading={false}
            readOnly
          />
        </section>
      ) : null}

      {tab === 1 ? (
        <section className="rph-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-rph-fg">Damage diagram</h2>
          <VehicleDamageDiagram
            damages={diagramDamages}
            mode={kind === "checkin" ? "diff" : "readonly"}
            allowExpand
          />
        </section>
      ) : null}

      {tab === 2 ? (
        <section className="rph-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-rph-fg">Photos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.media.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-lg border border-rph-border">
                {item.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt={item.caption ?? "Vehicle photo"}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-rph-chrome text-xs text-rph-fg-muted">
                    Photo
                  </div>
                )}
              </div>
            ))}
          </div>
          {!data.media.length ? <p className="rph-muted text-sm">No photos recorded.</p> : null}
        </section>
      ) : null}

      {tab === 3 ? (
        <section className="rph-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-rph-fg">Review</h2>
          {data.completedAt ? (
            <p className="text-sm text-rph-fg-secondary">
              Completed {formatUkDateTime(data.completedAt)}
            </p>
          ) : null}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="rph-muted text-xs">Odometer</dt>
              <dd className="text-rph-fg">{odometer.trim() ? `${odometer} mi` : "—"}</dd>
            </div>
            <div>
              <dt className="rph-muted text-xs">Fuel</dt>
              <dd className="text-rph-fg">{formatHireFuelLevelPercent(fuelLevel)}</dd>
            </div>
            <div>
              <dt className="rph-muted text-xs">Photos</dt>
              <dd className="text-rph-fg">{data.media.length}</dd>
            </div>
            <div>
              <dt className="rph-muted text-xs">Damage items</dt>
              <dd className="text-rph-fg">{data.damages.length}</dd>
            </div>
          </dl>
          <div>
            <h3 className="rph-muted mb-1 text-xs">Vehicle kit</h3>
            <ul className="space-y-1 text-sm text-rph-fg-secondary">
              {HIRE_INSPECTION_ACCESSORY_KEYS.map((key) => (
                <li key={key}>
                  {hireInspectionAccessoryLabel(key)}: {formatAccessoryPresence(accessories[key])}
                </li>
              ))}
            </ul>
          </div>
          {data.damages.length > 0 ? (
            <div>
              <h3 className="rph-muted mb-1 text-xs">Damage list</h3>
              <ul className="space-y-1 text-sm text-rph-fg-secondary">
                {data.damages.map((damage, index) => (
                  <li key={damage.id}>
                    #{index + 1}{" "}
                    {getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId} ·{" "}
                    {hireDamageTypeLabel(damage.damageType)} ·{" "}
                    {hireDamageSeverityLabel(damage.severity)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {generalNotes.trim() ? (
            <div>
              <h3 className="rph-muted mb-1 text-xs">Notes</h3>
              <p className="text-sm text-rph-fg-secondary whitespace-pre-wrap">{generalNotes.trim()}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
