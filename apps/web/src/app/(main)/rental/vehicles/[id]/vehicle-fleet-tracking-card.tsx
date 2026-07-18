"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getVehicleLiveTrackAction,
  getVehicleWeeklyMileageAction,
  setVehicleTrackerMileageAction,
  type LiveTrackSnapshot,
} from "@/app/actions/fleet-tracking";
import { formatMiles } from "@/lib/fleet-tracking/units";

export function VehicleFleetTrackingCard({
  vehicleId,
  canManage,
}: {
  vehicleId: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [snapshot, setSnapshot] = useState<LiveTrackSnapshot | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [weeklyMiles, setWeeklyMiles] = useState<number | null>(null);
  const [weeklyRange, setWeeklyRange] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mileageInput, setMileageInput] = useState("");
  const [setMsg, setSetMsg] = useState<string | null>(null);

  function refresh() {
    setError(null);
    startTransition(async () => {
      const [live, weekly] = await Promise.all([
        getVehicleLiveTrackAction(vehicleId),
        getVehicleWeeklyMileageAction(vehicleId),
      ]);
      if (!live.ok) {
        setError(live.error);
        setLinked(null);
        return;
      }
      if (!live.linked) {
        setLinked(false);
        setSnapshot(null);
        return;
      }
      setLinked(true);
      setSnapshot(live.snapshot);
      if (live.snapshot.odometerMiles != null) {
        setMileageInput(String(Math.round(live.snapshot.odometerMiles)));
      }

      if (weekly.ok && weekly.linked) {
        setWeeklyMiles(weekly.miles);
        setWeeklyRange(`${weekly.beginLabel} → ${weekly.endLabel}`);
      } else {
        setWeeklyMiles(null);
        setWeeklyRange(null);
      }
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per vehicle
  }, [vehicleId]);

  function submitMileage() {
    const miles = Number(mileageInput);
    if (!Number.isFinite(miles) || miles < 0) {
      setError("Enter a valid mileage in miles.");
      return;
    }
    setError(null);
    setSetMsg(null);
    startTransition(async () => {
      const res = await setVehicleTrackerMileageAction(vehicleId, miles);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSetMsg(`Mileage set on ${res.results.length} device(s).`);
      refresh();
    });
  }

  if (linked === false) return null;
  if (linked === null && !error) {
    return (
      <div className="rph-card p-4 sm:col-span-2 xl:col-span-3">
        <p className="rph-meta font-semibold uppercase tracking-wide">Fleet Tracking</p>
        <p className="rph-muted mt-2 text-sm">{pending ? "Loading tracker…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="rph-card space-y-4 p-4 sm:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="rph-meta font-semibold uppercase tracking-wide">Fleet Tracking</p>
          <p className="rph-muted mt-0.5 text-xs">Live data from SmartCar Tracker</p>
        </div>
        <button type="button" className="rph-btn-ghost h-8 px-3 text-xs" disabled={pending} onClick={refresh}>
          Refresh
        </button>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {setMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{setMsg}</p> : null}

      {snapshot ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Status</p>
            <p className="mt-1 text-sm font-semibold text-rph-fg">{snapshot.statusLabel}</p>
            <p className="rph-meta">{snapshot.ignitionLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Odometer</p>
            <p className="mt-1 text-sm font-semibold text-rph-fg">
              {snapshot.odometerMiles != null ? `${formatMiles(snapshot.odometerMiles, 0)} mi` : "—"}
            </p>
            <p className="rph-meta">
              Today: {snapshot.todayMiles != null ? `${formatMiles(snapshot.todayMiles, 1)} mi` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Speed</p>
            <p className="mt-1 text-sm font-semibold text-rph-fg">
              {snapshot.speedMph != null ? `${formatMiles(snapshot.speedMph, 0)} mph` : "—"}
            </p>
            <p className="rph-meta">Last GPS: {snapshot.lastGpsAt ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Location</p>
            {snapshot.latitude != null && snapshot.longitude != null ? (
              <>
                <p className="mt-1 font-mono text-xs text-rph-fg">
                  {snapshot.latitude.toFixed(5)}, {snapshot.longitude.toFixed(5)}
                </p>
                {snapshot.mapUrl ? (
                  <a
                    href={snapshot.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rph-link mt-1 inline-block text-xs"
                  >
                    Open map
                  </a>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-rph-fg-muted">No fix</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="border-t border-rph-border pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Weekly mileage (7 days)</p>
        <p className="mt-1 text-sm font-semibold text-rph-fg">
          {weeklyMiles != null ? `${formatMiles(weeklyMiles, 1)} mi` : "—"}
        </p>
        {weeklyRange ? <p className="rph-meta">{weeklyRange}</p> : null}
      </div>

      {canManage ? (
        <div className="border-t border-rph-border pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Set tracker mileage</p>
          <p className="rph-meta mt-1">Enter miles. The app converts to km before sending to all linked devices.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="sr-only">Mileage (miles)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="rph-input w-40"
                value={mileageInput}
                disabled={pending}
                onChange={(e) => setMileageInput(e.target.value)}
              />
            </label>
            <button type="button" className="rph-btn-primary" disabled={pending} onClick={submitMileage}>
              {pending ? "Sending…" : "Set mileage"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
