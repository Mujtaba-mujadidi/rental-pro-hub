"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getVehicleLiveTrackAction,
  getVehicleWeeklyMileageAction,
  setVehicleTrackerMileageAction,
  type LiveTrackSnapshot,
} from "@/app/actions/fleet-tracking";
import { describeTrackingDataSource, type TrackingDataSource } from "@/lib/fleet-tracking/mapping";
import { formatMiles } from "@/lib/fleet-tracking/units";

function CardSectionLoader({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-rph-raised/85 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
          aria-hidden
        />
        <p className="text-xs font-medium text-rph-fg-secondary">{label}</p>
      </div>
    </div>
  );
}

export function VehicleFleetTrackingCard({
  vehicleId,
  canManage,
}: {
  vehicleId: string;
  canManage: boolean;
}) {
  const [refreshPending, startRefresh] = useTransition();
  const [setPending, startSet] = useTransition();
  const [snapshot, setSnapshot] = useState<LiveTrackSnapshot | null>(null);
  const [trackingSource, setTrackingSource] = useState<TrackingDataSource | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [weeklyMiles, setWeeklyMiles] = useState<number | null>(null);
  const [weeklyRange, setWeeklyRange] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mileageInput, setMileageInput] = useState("");
  const [setMsg, setSetMsg] = useState<string | null>(null);

  function refresh() {
    setError(null);
    startRefresh(async () => {
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
        setTrackingSource(null);
        return;
      }
      setLinked(true);
      setSnapshot(live.snapshot);
      setTrackingSource(live.source);

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
    const milesInt = Math.ceil(miles);
    setMileageInput(String(milesInt));
    setError(null);
    setSetMsg(null);
    startSet(async () => {
      const res = await setVehicleTrackerMileageAction(vehicleId, milesInt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const devices =
        res.deviceCount > 1 ? ` on ${res.deviceCount} devices` : "";
      setSetMsg(
        `Mileage set to ${formatMiles(res.targetMiles, 0)} mi${devices}. The tracker may take a few minutes to update — refresh later to check.`,
      );
      setMileageInput("");
      refresh();
    });
  }

  if (linked === false) return null;

  const initialLoading = linked === null && !error;

  const sourceLine = trackingSource ? describeTrackingDataSource(trackingSource) : null;
  const secondaryNote =
    trackingSource?.hasSecondaryDevice && trackingSource.secondaryDeviceLabel
      ? `Secondary device linked (${trackingSource.secondaryDeviceLabel}) — not used for live readings.`
      : null;

  return (
    <div className="rph-card space-y-4 p-4 sm:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="rph-meta font-semibold uppercase tracking-wide">Fleet Tracking</p>
          <p className="rph-muted mt-0.5 text-xs">Live data from SmartCar Tracker</p>
          {sourceLine ? (
            <p className="mt-1 text-xs font-medium text-rph-fg-secondary">{sourceLine}</p>
          ) : null}
          {secondaryNote ? <p className="rph-meta mt-0.5 text-xs">{secondaryNote}</p> : null}
        </div>
        {!initialLoading ? (
          <button
            type="button"
            className="rph-btn-ghost h-8 px-3 text-xs"
            disabled={refreshPending || setPending}
            onClick={refresh}
          >
            Refresh
          </button>
        ) : null}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {setMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{setMsg}</p> : null}

      <div className="relative min-h-[7.5rem]">
        {initialLoading ? <CardSectionLoader label="Loading tracker…" /> : null}
        {!initialLoading && refreshPending ? <CardSectionLoader label="Refreshing tracker…" /> : null}

        {snapshot ? (
          <div
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${refreshPending ? "pointer-events-none opacity-60" : ""}`}
          >
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
        ) : !initialLoading ? (
          <p className="rph-muted text-sm">No live track data yet.</p>
        ) : null}

        <div
          className={`border-t border-rph-border pt-4 ${refreshPending && !initialLoading ? "pointer-events-none opacity-60" : ""}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Weekly mileage (7 days)</p>
          {sourceLine ? <p className="rph-meta mt-0.5 text-xs">From {sourceLine.toLowerCase()}</p> : null}
          <p className="mt-1 text-sm font-semibold text-rph-fg">
            {weeklyMiles != null ? `${formatMiles(weeklyMiles, 1)} mi` : "—"}
          </p>
          {weeklyRange ? <p className="rph-meta">{weeklyRange}</p> : null}
        </div>
      </div>

      {canManage && !initialLoading ? (
        <div className="relative border-t border-rph-border pt-4">
          {setPending ? <CardSectionLoader label="Sending mileage to tracker…" /> : null}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Set tracker mileage</p>
          <p className="rph-meta mt-1">
            Optional — only when correcting the tracker. Enter miles; rounded up and sent as whole kilometres.
          </p>
          <div
            className={`mt-2 flex flex-wrap items-end gap-2 ${setPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <label className="block space-y-1">
              <span className="sr-only">Mileage (miles)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="rph-input w-40"
                value={mileageInput}
                placeholder="Miles"
                disabled={setPending || refreshPending}
                onChange={(e) => setMileageInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rph-btn-primary"
              disabled={setPending || refreshPending || !mileageInput.trim()}
              onClick={submitMileage}
            >
              Set mileage
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
