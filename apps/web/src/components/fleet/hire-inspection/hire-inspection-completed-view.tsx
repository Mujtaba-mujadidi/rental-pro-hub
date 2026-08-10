"use client";

import { useState } from "react";
import { HireInspectionPdfExportButton } from "@/components/fleet/hire-inspection/hire-inspection-pdf-export-button";
import { HireInspectionLazyImage } from "@/components/fleet/hire-inspection/hire-inspection-lazy-image";
import { HireInspectionVehicleMetrics } from "@/components/fleet/hire-inspection/hire-inspection-vehicle-metrics";
import { HireInspectionDamageLayout } from "@/components/fleet/hire-inspection/hire-inspection-damage-layout";
import { HireInspectionRecordedDamageList } from "@/components/fleet/hire-inspection/hire-inspection-recorded-damage-list";
import { VehicleDamageDiagram } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import {
  formatHireInspectionOdometer,
  formatHireInspectionStamp,
  summarizeInspectionKit,
} from "@/lib/fleet/hire-inspection-display";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import {
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";
import type { VehicleDamageDiagramEntry } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import { HireWorkspaceChip } from "@/components/fleet/hire-workspace/hire-workspace-ui";

const TABS = [
  { id: "vehicle", label: "Vehicle" },
  { id: "damage", label: "Damage" },
  { id: "photos", label: "Photos" },
  { id: "summary", label: "Summary" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type HireInspectionCompletedViewProps = {
  hireGroupId: string;
  vehicleLabel: string;
  kind: HireInspectionKind;
  data: HireInspectionPayload;
  diagramDamages: VehicleDamageDiagramEntry[];
  odometer: string;
  fuelLevel: number | null;
  accessories: HireInspectionAccessories;
  generalNotes: string;
  trackerLinked?: boolean;
  completedByLabel?: string;
  checkinCompleted?: boolean;
};

export function HireInspectionCompletedView({
  hireGroupId,
  vehicleLabel,
  kind,
  data,
  diagramDamages,
  odometer,
  fuelLevel,
  accessories,
  generalNotes,
  trackerLinked = false,
  completedByLabel = "Company staff",
  checkinCompleted = false,
}: HireInspectionCompletedViewProps) {
  const [tab, setTab] = useState<TabId>("summary");
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const title = kind === "checkout" ? "Vehicle checkout" : "Vehicle check-in";
  const recordedAtLabel = kind === "checkout" ? "Recorded at checkout" : "Recorded at check-in";
  const odometerMiles = odometer.trim()
    ? Number.parseInt(odometer.replace(/,/g, ""), 10)
    : data.odometerReading;
  const kitSummary = summarizeInspectionKit(accessories, HIRE_INSPECTION_ACCESSORY_KEYS);
  const hireResult =
    kind === "checkout" ? "Vehicle handed over" : checkinCompleted ? "Vehicle returned" : "Return recorded";
  const hireResultDetail = generalNotes.trim() ? "Notes recorded on inspection" : null;

  return (
    <section className="hire-ws-inspection-panel">
      <div className="hire-ws-inspection-panel-header">
        <div className="min-w-0">
          <p className="hire-ws-section-kicker">Completed inspection</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-rph-fg">{title}</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">
            {formatHireInspectionStamp(data.completedAt)}
            <span className="text-rph-fg-muted"> · </span>
            {completedByLabel}
          </p>
        </div>
        <HireInspectionPdfExportButton hireGroupId={hireGroupId} kind={kind} vehicleLabel={vehicleLabel} />
      </div>

      <nav className="hire-ws-inspection-subtabs" aria-label="Inspection sections">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "hire-ws-tab hire-ws-tab-active" : "hire-ws-tab"}
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="hire-ws-inspection-panel-body">
        {tab === "vehicle" ? (
          <>
            <HireInspectionVehicleMetrics
              odometerMiles={Number.isFinite(odometerMiles) ? odometerMiles : data.odometerReading}
              fuelLevelPercent={fuelLevel}
              completedAt={data.completedAt}
              trackerLinked={trackerLinked}
              recordedAtLabel={recordedAtLabel}
            />

            <div>
              <h3 className="text-sm font-semibold text-rph-fg">Vehicle kit</h3>
              <p className="mt-0.5 text-xs text-rph-fg-secondary">
                Items recorded when the vehicle was handed over.
              </p>
              <ul className="hire-ws-inspection-kit-grid mt-3">
                {HIRE_INSPECTION_ACCESSORY_KEYS.map((key) => (
                  <li key={key} className="hire-ws-inspection-kit-row">
                    <span className="text-sm text-rph-fg">{hireInspectionAccessoryLabel(key)}</span>
                    <AccessoryChip value={accessories[key]} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {tab === "damage" ? (
          <HireInspectionDamageLayout
            diagram={
              <VehicleDamageDiagram
                damages={diagramDamages}
                mode={kind === "checkin" ? "diff" : "readonly"}
                allowExpand
                showDamageList={false}
                selectedDamageId={selectedDamageId}
                onDamageSelect={setSelectedDamageId}
              />
            }
            list={
              <HireInspectionRecordedDamageList
                damages={data.damages}
                selectedDamageId={selectedDamageId}
                onSelect={setSelectedDamageId}
              />
            }
          />
        ) : null}

        {tab === "photos" ? (
          <div>
            {data.media.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.media.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-lg border border-rph-border">
                    <HireInspectionLazyImage
                      hireGroupId={hireGroupId}
                      mediaId={item.id}
                      alt={item.caption ?? "Vehicle photo"}
                      eagerSrc={item.signedUrl}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-rph-fg-muted">No photos recorded.</p>
            )}
          </div>
        ) : null}

        {tab === "summary" ? (
          <>
            <div className="hire-ws-inspection-status-grid">
              <div className="hire-ws-inspection-status-card">
                <p className="hire-ws-section-kicker">Inspection status</p>
                <div className="mt-2">
                  <HireWorkspaceChip tone="success" dot>
                    Completed
                  </HireWorkspaceChip>
                </div>
              </div>
              <div className="hire-ws-inspection-status-card">
                <p className="hire-ws-section-kicker">Recorded by</p>
                <p className="mt-2 text-sm font-semibold text-rph-fg">{completedByLabel}</p>
                <p className="mt-0.5 text-xs text-rph-fg-muted">{formatHireInspectionStamp(data.completedAt)}</p>
              </div>
              <div className="hire-ws-inspection-status-card">
                <p className="hire-ws-section-kicker">Hire result</p>
                <p className="mt-2 text-sm font-semibold text-rph-fg">{hireResult}</p>
                {hireResultDetail ? (
                  <p className="mt-0.5 text-xs text-rph-fg-muted">{hireResultDetail}</p>
                ) : null}
              </div>
            </div>

            <div className="hire-ws-inspection-summary-section">
              <h3 className="text-sm font-semibold text-rph-fg">
                {kind === "checkout" ? "Checkout summary" : "Check-in summary"}
              </h3>
              <dl className="mt-2">
                <SummaryRow
                  label="Odometer"
                  value={
                    odometer.trim()
                      ? `${odometer} mi`
                      : formatHireInspectionOdometer(data.odometerReading)
                  }
                />
                <SummaryRow
                  label="Fuel"
                  value={formatHireFuelLevelPercent(fuelLevel).replace("Not recorded", "—")}
                />
                <SummaryRow label="Kit recorded" value={kitSummary} />
                <SummaryRow
                  label="Check-in"
                  value={checkinCompleted ? "Completed" : "Not started"}
                />
              </dl>
            </div>

            {generalNotes.trim() ? (
              <div className="rounded-lg border border-rph-border/70 bg-rph-page/40 px-3 py-2.5">
                <p className="hire-ws-section-kicker">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-rph-fg-secondary">{generalNotes.trim()}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hire-ws-inspection-summary-row">
      <dt className="hire-ws-inspection-summary-label">{label}</dt>
      <dd className="hire-ws-inspection-summary-value">{value}</dd>
    </div>
  );
}

function AccessoryChip({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <HireWorkspaceChip tone="success" dot>
        Present
      </HireWorkspaceChip>
    );
  }
  if (value === false) {
    return (
      <span className="hire-ws-chip border-rph-border bg-rph-raised text-rph-fg-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" aria-hidden />
        Not present
      </span>
    );
  }
  return <span className="text-xs text-rph-fg-muted">Not recorded</span>;
}
