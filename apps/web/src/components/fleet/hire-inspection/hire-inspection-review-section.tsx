"use client";

import type {
  HireInspectionPaymentAccountOption,
  HireInspectionPayload,
} from "@/app/actions/hire-inspections";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  HIRE_INSPECTION_DAMAGE_CHARGE_RESOLUTIONS,
  summarizeInspectionDamageCharges,
  type HireInspectionDamageChargeResolution,
} from "@/lib/fleet/hire-inspection-damage-charges";
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

const RESOLUTION_LABELS: Record<HireInspectionDamageChargeResolution, string> = {
  waived: "No charge",
  paid_now: "Charge now",
  add_to_balance: "Add to driver balance",
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
  onDamageChargeChange: (
    damageId: string,
    patch: { chargeGbp: number | null; chargeResolution: HireInspectionDamageChargeResolution | null },
  ) => void;
  paymentAccounts: HireInspectionPaymentAccountOption[];
  damagePaymentMethod: string;
  damagePaymentAccountId: string;
  damagePaymentReference: string;
  onDamagePaymentMethodChange: (value: string) => void;
  onDamagePaymentAccountChange: (value: string) => void;
  onDamagePaymentReferenceChange: (value: string) => void;
  readOnly?: boolean;
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
  onDamageChargeChange,
  paymentAccounts,
  damagePaymentMethod,
  damagePaymentAccountId,
  damagePaymentReference,
  onDamagePaymentMethodChange,
  onDamagePaymentAccountChange,
  onDamagePaymentReferenceChange,
  readOnly = false,
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
  const chargeSummary = summarizeInspectionDamageCharges(draftDamages);

  const changedVehicleRows = vehicleChanges
    ? [...vehicleChanges.rows.filter((row) => row.changed), ...vehicleChanges.accessoryChanges]
    : [];

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
                New damage — resolution
              </h3>
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
                          : "No charge recorded"}
                        {damage.chargeGbp ? ` · ${formatGbp(damage.chargeGbp)}` : ""}
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-xs">
                          <span className="font-medium text-rph-fg-muted">Charge (£)</span>
                          <input
                            className="rph-input w-full"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={
                              damage.chargeGbp != null && damage.chargeGbp > 0
                                ? String(damage.chargeGbp)
                                : ""
                            }
                            onChange={(event) => {
                              const raw = event.target.value.trim();
                              onDamageChargeChange(damage.id, {
                                chargeGbp: raw ? Number(raw) : null,
                                chargeResolution: damage.chargeResolution,
                              });
                            }}
                          />
                        </label>
                        <label className="space-y-1 text-xs">
                          <span className="font-medium text-rph-fg-muted">Resolution</span>
                          <select
                            className="rph-input w-full"
                            value={damage.chargeResolution ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              onDamageChargeChange(damage.id, {
                                chargeGbp: damage.chargeGbp,
                                chargeResolution: (value ||
                                  null) as HireInspectionDamageChargeResolution | null,
                              });
                            }}
                          >
                            <option value="">Select…</option>
                            {HIRE_INSPECTION_DAMAGE_CHARGE_RESOLUTIONS.map((resolution) => (
                              <option key={resolution} value={resolution}>
                                {RESOLUTION_LABELS[resolution]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rph-muted text-sm">No new damage since checkout.</p>
          )}

          {chargeSummary.paidNowGbp > 0 || chargeSummary.addToBalanceGbp > 0 ? (
            <div className="rounded-lg border border-rph-border bg-rph-chrome/40 p-3 text-sm">
              {chargeSummary.paidNowGbp > 0 ? (
                <p>
                  Collecting now: <span className="font-medium">{formatGbp(chargeSummary.paidNowGbp)}</span>
                </p>
              ) : null}
              {chargeSummary.addToBalanceGbp > 0 ? (
                <p className={chargeSummary.paidNowGbp > 0 ? "mt-1" : ""}>
                  Adding to driver balance:{" "}
                  <span className="font-medium">{formatGbp(chargeSummary.addToBalanceGbp)}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {!readOnly && chargeSummary.paidNowGbp > 0 ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-rph-fg-secondary">
                On-the-spot payment
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-rph-fg-muted">Method</span>
                  <select
                    className="rph-input w-full"
                    value={damagePaymentMethod}
                    onChange={(event) => onDamagePaymentMethodChange(event.target.value)}
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-rph-fg-muted">Payment account</span>
                  <select
                    className="rph-input w-full"
                    value={damagePaymentAccountId}
                    onChange={(event) => onDamagePaymentAccountChange(event.target.value)}
                  >
                    <option value="">Select account…</option>
                    {paymentAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                        {account.isDefault ? " (hire default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs sm:col-span-2">
                  <span className="font-medium text-rph-fg-muted">Reference (optional)</span>
                  <input
                    className="rph-input w-full"
                    value={damagePaymentReference}
                    onChange={(event) => onDamagePaymentReferenceChange(event.target.value)}
                    placeholder="Payment reference"
                  />
                </label>
              </div>
            </div>
          ) : null}
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
