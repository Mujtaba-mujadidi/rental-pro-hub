"use client";

import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import type { HireInspectionAccessories } from "@/lib/fleet/hire-inspection-accessories";
import { summarizeCheckinVehicleChanges } from "@/lib/fleet/hire-inspection-checkin-summary";
import type { HireInspectionDraftDamage } from "@/lib/fleet/hire-inspection-draft-damages";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";

const RESOLUTION_LABELS: Record<HireInspectionDamageChargeResolution, string> = {
  waived: "No charge",
  paid_now: "Charge now",
  add_to_balance: "Added to driver balance",
  review_later: "Review later",
};

type HireInspectionReviewSectionProps = {
  kind: HireInspectionKind;
  odometer: string;
  fuelLevel: number | null;
  accessories: HireInspectionAccessories;
  draftMediaCount: number;
  draftDamages: HireInspectionDraftDamage[];
  checkoutBaseline: HireInspectionPayload | null;
  generalNotes: string;
  onGeneralNotesChange: (value: string) => void;
  readOnly?: boolean;
  /** When true (check-in), damage pricing is deferred to the final account step. */
  deferDamageCharges?: boolean;
};

function toDiffRows(damages: HireInspectionDraftDamage[]) {
  return damages.map((damage) => ({
    id: damage.id,
    panelId: damage.panelId,
    damageType: damage.damageType,
    severity: damage.severity,
    notes: damage.notes,
    checkoutDamageId: damage.checkoutDamageId,
    diagramView: damage.diagramView,
    pinX: damage.pinX,
    pinY: damage.pinY,
    chargeGbp: damage.chargeGbp,
    chargeResolution: damage.chargeResolution,
  }));
}

export function HireInspectionReviewSection({
  kind,
  odometer,
  fuelLevel,
  accessories,
  draftMediaCount,
  draftDamages,
  checkoutBaseline,
  generalNotes,
  onGeneralNotesChange,
  readOnly = false,
  deferDamageCharges = false,
}: HireInspectionReviewSectionProps) {
  const diff =
    kind === "checkin" && checkoutBaseline
      ? buildHireInspectionDiff(toDiffRows(checkoutBaseline.damages), toDiffRows(draftDamages))
      : null;
  const vehicleChanges =
    kind === "checkin" && checkoutBaseline
      ? summarizeCheckinVehicleChanges({
          checkoutOdometer: checkoutBaseline.odometerReading,
          checkoutFuelLevel: checkoutBaseline.fuelLevel,
          checkoutAccessories: checkoutBaseline.accessories,
          checkoutNotes: checkoutBaseline.generalNotes,
          checkoutMediaCount: checkoutBaseline.media.length,
          checkinOdometer: odometer,
          checkinFuelLevel: fuelLevel,
          checkinAccessories: accessories,
          checkinNotes: generalNotes,
          checkinMediaCount: draftMediaCount,
        })
      : null;
  const changedVehicleRows = vehicleChanges
    ? [...vehicleChanges.rows.filter((row) => row.changed), ...vehicleChanges.accessoryChanges]
    : [];

  const showDeferredDamageNotice = deferDamageCharges && !readOnly;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-rph-fg">Summary</h2>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          {odometer.trim() ? `${odometer} mi` : "No odometer"} ·{" "}
          {fuelLevel != null ? formatHireFuelLevelPercent(fuelLevel) : "No fuel level"} · {draftMediaCount}{" "}
          photo{draftMediaCount === 1 ? "" : "s"} · {draftDamages.length} damage
          {draftDamages.length === 1 ? "" : "s"}
        </p>
      </div>

      {vehicleChanges ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-rph-border p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
              Changes since checkout
            </h3>
            {vehicleChanges.hasAnyChange ? (
              <p className="rph-muted mt-1 text-xs">
                Vehicle readings and accessories recorded differently at check-in.
                {vehicleChanges.odometerDeltaMiles != null
                  ? ` Odometer ${vehicleChanges.odometerDeltaMiles >= 0 ? "+" : ""}${vehicleChanges.odometerDeltaMiles} mi.`
                  : ""}
              </p>
            ) : (
              <p className="rph-muted mt-1 text-xs">
                No changes to odometer, fuel, accessories, photos, or notes since checkout.
              </p>
            )}
          </div>

          {changedVehicleRows.length ? (
            <div className="overflow-hidden rounded-lg border border-rph-border">
              <table className="min-w-full text-sm">
                <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Checkout</th>
                    <th className="px-3 py-2">Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {changedVehicleRows.map((row) => (
                    <tr key={row.id} className="border-t border-rph-border">
                      <td className="px-3 py-2 font-medium text-rph-fg">{row.label}</td>
                      <td className="px-3 py-2 text-rph-fg-secondary">{row.checkoutDisplay}</td>
                      <td className="px-3 py-2 text-rph-fg">{row.checkinDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {diff ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-rph-border p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
              Damage comparison
            </h3>
            <p className="rph-muted mt-1 text-xs">
              {diff.preExistingDamages.length} pre-existing · {diff.newDamages.length} new since checkout
            </p>
          </div>

          {diff.preExistingDamages.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
                Pre-existing at checkout
              </h3>
              <ul className="space-y-2">
                {diff.preExistingDamages.map((damage) => (
                  <li
                    key={damage.id}
                    className="rounded-lg border border-rph-border bg-rph-chrome/40 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-rph-fg">
                      {getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId}
                    </p>
                    <p className="text-xs text-rph-fg-secondary">
                      {hireDamageTypeLabel(damage.damageType)} · {hireDamageSeverityLabel(damage.severity)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diff.newDamages.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
                {deferDamageCharges && !readOnly ? "New damage" : "New damage — resolution"}
              </h3>
              {showDeferredDamageNotice ? (
                <p className="rounded-lg border border-rph-border bg-rph-chrome/40 px-3 py-2 text-sm text-rph-fg-secondary">
                  {diff.newDamages.length === 1
                    ? "1 new damage recorded"
                    : `${diff.newDamages.length} new damages recorded`}
                  . Pricing will be decided on the final account step after check-in.
                </p>
              ) : null}
              <ul className="space-y-3">
                {diff.newDamages.map((damage) => (
                  <li key={damage.id} className="rounded-lg border border-rph-border p-3">
                    <p className="text-sm font-medium text-rph-fg">
                      {getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId}
                    </p>
                    <p className="text-xs text-rph-fg-secondary">
                      {hireDamageTypeLabel(damage.damageType)} · {hireDamageSeverityLabel(damage.severity)}
                      {damage.notes ? ` · ${damage.notes}` : ""}
                    </p>
                    {readOnly ? (
                      <p className="mt-2 text-xs text-rph-fg-muted">
                        {damage.chargeResolution
                          ? RESOLUTION_LABELS[damage.chargeResolution]
                          : "Pending office review"}
                        {damage.chargeGbp ? ` · ${formatGbp(damage.chargeGbp)}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rph-muted text-sm">No new damage since checkout.</p>
          )}
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="rph-muted mb-1 block text-xs">Additional notes</span>
        <textarea
          className="rph-input min-h-20"
          value={generalNotes}
          onChange={(e) => onGeneralNotesChange(e.target.value)}
          placeholder="Any extra observations before completing…"
          disabled={readOnly}
        />
      </label>
    </div>
  );
}
