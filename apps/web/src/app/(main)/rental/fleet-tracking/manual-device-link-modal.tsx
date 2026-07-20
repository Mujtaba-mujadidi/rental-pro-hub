"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { deviceGroupOptionLabel, type DeviceGroup } from "@/lib/fleet-tracking/mapping";

export type ManualLinkVehicle = {
  id: string;
  vrm: string;
  make: string;
  model: string;
};

export type ManualDeviceLinkModalProps = {
  open: boolean;
  pending: boolean;
  vehicles: ManualLinkVehicle[];
  deviceGroups: DeviceGroup[];
  initialVehicleId?: string | null;
  initialDeviceBaseVrm?: string | null;
  onClose: () => void;
  onSubmit: (input: { vehicleId: string; deviceBaseVrm: string }) => void;
};

function vehicleOptionLabel(vehicle: ManualLinkVehicle) {
  return `${vehicle.vrm} · ${vehicle.make} ${vehicle.model}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}

export function ManualDeviceLinkModal({
  open,
  pending,
  vehicles,
  deviceGroups,
  initialVehicleId = null,
  initialDeviceBaseVrm = null,
  onClose,
  onSubmit,
}: ManualDeviceLinkModalProps) {
  const [vehicleId, setVehicleId] = useState("");
  const [deviceBaseVrm, setDeviceBaseVrm] = useState("");
  const [baseline, setBaseline] = useState({ vehicleId: "", deviceBaseVrm: "" });
  const [discardConfirm, setDiscardConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextVehicleId = initialVehicleId ?? vehicles[0]?.id ?? "";
    const nextDeviceBaseVrm = initialDeviceBaseVrm ?? deviceGroups[0]?.baseVrm ?? "";
    setVehicleId(nextVehicleId);
    setDeviceBaseVrm(nextDeviceBaseVrm);
    setBaseline({ vehicleId: nextVehicleId, deviceBaseVrm: nextDeviceBaseVrm });
    setDiscardConfirm(false);
  }, [open, initialVehicleId, initialDeviceBaseVrm, vehicles, deviceGroups]);

  const selectedGroup = deviceGroups.find((group) => group.baseVrm === deviceBaseVrm) ?? null;
  const isDirty = vehicleId !== baseline.vehicleId || deviceBaseVrm !== baseline.deviceBaseVrm;
  const canSubmit = Boolean(vehicleId && deviceBaseVrm && selectedGroup);

  function requestClose() {
    if (isDirty) {
      setDiscardConfirm(true);
      return;
    }
    onClose();
  }

  return (
    <FormModalShell
      open={open}
      titleId="manual-device-link-title"
      title="Link device to vehicle"
      description="Choose an unmatched fleet vehicle and tracker device group. Immobiliser devices are used as primary when present."
      showDraftActions={false}
      pending={pending}
      isDirty={isDirty}
      maxWidthClass="max-w-2xl"
      panelClassName="relative z-[1] flex max-h-[min(90vh,36rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-rph-border bg-rph-raised shadow-lg"
      onRequestClose={requestClose}
      discardConfirmOpen={discardConfirm}
      onConfirmDiscard={() => {
        setDiscardConfirm(false);
        onClose();
      }}
      onCancelDiscard={() => setDiscardConfirm(false)}
      footer={
        <div className="rph-btn-modal-footer">
          <button
            type="button"
            className="rph-btn-primary"
            disabled={pending || !canSubmit}
            onClick={() => onSubmit({ vehicleId, deviceBaseVrm })}
          >
            Link vehicle
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Vehicle">
          <select
            className="rph-input"
            value={vehicleId}
            disabled={pending || !vehicles.length}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            {!vehicles.length ? <option value="">No unmatched vehicles</option> : null}
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicleOptionLabel(vehicle)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tracker device group">
          <select
            className="rph-input"
            value={deviceBaseVrm}
            disabled={pending || !deviceGroups.length}
            onChange={(event) => setDeviceBaseVrm(event.target.value)}
          >
            {!deviceGroups.length ? <option value="">No unmatched devices</option> : null}
            {deviceGroups.map((group) => (
              <option key={group.baseVrm} value={group.baseVrm}>
                {deviceGroupOptionLabel(group)}
              </option>
            ))}
          </select>
        </Field>

        {selectedGroup ? (
          <div className="rounded-xl border border-rph-border bg-rph-chrome/40 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Will link</p>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="text-rph-fg-muted">Primary device</dt>
                <dd className="mt-0.5 font-medium text-rph-fg">{selectedGroup.primaryName}</dd>
                <dd className="font-mono text-xs text-rph-fg-muted">{selectedGroup.primaryImei}</dd>
              </div>
              <div>
                <dt className="text-rph-fg-muted">Secondary device</dt>
                {selectedGroup.secondaryName ? (
                  <>
                    <dd className="mt-0.5 font-medium text-rph-fg">{selectedGroup.secondaryName}</dd>
                    <dd className="font-mono text-xs text-rph-fg-muted">{selectedGroup.secondaryImei}</dd>
                  </>
                ) : (
                  <dd className="mt-0.5 text-rph-fg-muted">—</dd>
                )}
              </div>
            </dl>
          </div>
        ) : (
          <p className="rph-muted text-sm">Select a vehicle and device group to preview the link.</p>
        )}
      </div>
    </FormModalShell>
  );
}
