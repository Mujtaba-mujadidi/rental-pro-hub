"use client";

import type { HireInspectionDamageItem } from "@/app/actions/hire-inspections";
import {
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageSeverityTextClass,
  hireDamageTypeLabel,
} from "@/lib/fleet/vehicle-damage-panels";

type HireInspectionRecordedDamageListProps = {
  damages: HireInspectionDamageItem[];
  selectedDamageId: string | null;
  onSelect: (damageId: string) => void;
};

export function HireInspectionRecordedDamageList({
  damages,
  selectedDamageId,
  onSelect,
}: HireInspectionRecordedDamageListProps) {
  if (!damages.length) {
    return (
      <aside className="hire-ws-inspection-damage-list">
        <p className="text-sm text-rph-fg-muted">No damage recorded.</p>
      </aside>
    );
  }

  const countLabel = damages.length === 1 ? "1 recorded item" : `${damages.length} recorded items`;

  return (
    <aside className="hire-ws-inspection-damage-list">
      <header className="hire-ws-inspection-damage-list-header">
        <h3 className="text-sm font-semibold text-rph-fg">{countLabel}</h3>
        <p className="mt-0.5 text-xs text-rph-fg-secondary">Select a marker to view damage details.</p>
      </header>
      <ul className="hire-ws-inspection-damage-list-items">
        {damages.map((damage, index) => {
          const panelLabel = getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId;
          const selected = selectedDamageId === damage.id;
          return (
            <li key={damage.id}>
              <button
                type="button"
                className={
                  selected
                    ? "hire-ws-inspection-damage-item hire-ws-inspection-damage-item-active"
                    : "hire-ws-inspection-damage-item"
                }
                onClick={() => onSelect(damage.id)}
              >
                <span className="hire-ws-inspection-damage-item-marker" aria-hidden>
                  {index + 1}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold text-rph-fg">{panelLabel}</span>
                  <span
                    className={`mt-0.5 block text-xs font-medium ${hireDamageSeverityTextClass(damage.severity)}`}
                  >
                    {hireDamageTypeLabel(damage.damageType)} · {hireDamageSeverityLabel(damage.severity)}
                  </span>
                  {damage.notes?.trim() ? (
                    <span className="mt-0.5 block text-xs text-rph-fg-secondary">{damage.notes.trim()}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
