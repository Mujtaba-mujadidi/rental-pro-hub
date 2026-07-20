"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmVehicleDocAttentionAction } from "@/app/actions/rental-maintenance";

export function VehicleDocAttentionBanner({
  vehicleId,
  motAttentionAt,
  phvAttentionAt,
  canConfirm,
}: {
  vehicleId: string;
  motAttentionAt: string | null;
  phvAttentionAt: string | null;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motChecked, setMotChecked] = useState(false);
  const [phvChecked, setPhvChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showMot = Boolean(motAttentionAt);
  const showPhv = Boolean(phvAttentionAt);
  if (!showMot && !showPhv) return null;

  function confirmKind(kind: "mot" | "phv") {
    setError(null);
    startTransition(async () => {
      const res = await confirmVehicleDocAttentionAction({ vehicleId, kind });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (kind === "mot") setMotChecked(false);
      else setPhvChecked(false);
      router.refresh();
    });
  }

  return (
    <div className="rph-alert-warn mb-5 space-y-3 text-sm">
      <p className="font-semibold">Upload renewed documents</p>
      <p>
        Maintenance updated this vehicle’s{" "}
        {[showMot && "MOT", showPhv && "PHV/Taxi licence"].filter(Boolean).join(" and ")} expiry.
        Upload the new file on Documents, or confirm once it is done.
      </p>
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <div className="space-y-2">
        {showMot ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={motChecked}
                disabled={!canConfirm || pending}
                onChange={(e) => setMotChecked(e.target.checked)}
              />
              <span>I confirm the new MOT certificate has been uploaded.</span>
            </label>
            {canConfirm ? (
              <button
                type="button"
                className="rph-btn-primary h-8 px-3 text-xs"
                disabled={!motChecked || pending}
                onClick={() => confirmKind("mot")}
              >
                Confirm MOT
              </button>
            ) : null}
          </div>
        ) : null}
        {showPhv ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={phvChecked}
                disabled={!canConfirm || pending}
                onChange={(e) => setPhvChecked(e.target.checked)}
              />
              <span>I confirm the new PHV/Taxi licence paper has been uploaded.</span>
            </label>
            {canConfirm ? (
              <button
                type="button"
                className="rph-btn-primary h-8 px-3 text-xs"
                disabled={!phvChecked || pending}
                onClick={() => confirmKind("phv")}
              >
                Confirm PHV
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
