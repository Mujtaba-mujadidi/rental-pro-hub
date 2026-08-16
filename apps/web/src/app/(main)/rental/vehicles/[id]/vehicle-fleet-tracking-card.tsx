"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { ManualDeviceLinkModal } from "@/app/(main)/rental/fleet-tracking/manual-device-link-modal";
import {
  confirmVehicleMappingsAction,
  getVehicleLiveTrackAction,
  getVehicleWeeklyMileageAction,
  loadMappingSuggestionsAction,
  setVehicleTrackerMileageAction,
  type LiveTrackSnapshot,
} from "@/app/actions/fleet-tracking";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { TrackerLocationMap } from "@/components/fleet/tracker-location-map";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { describeTrackingDataSource, type DeviceGroup, type TrackingDataSource } from "@/lib/fleet-tracking/mapping";
import { SMARTCAR_TRACKER_APP_URL } from "@/lib/fleet-tracking/messaging";
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

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "neutral" | "warn";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-rph-border bg-rph-chrome text-rph-fg-secondary";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-rph-border py-2.5 last:border-0">
      <dt className="shrink-0 text-xs font-medium text-rph-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-rph-fg">{children}</dd>
    </div>
  );
}

function freshnessLabel(refreshedAtMs: number | null): { label: string; tone: "success" | "neutral" | "warn" } {
  if (refreshedAtMs == null) return { label: "Not loaded", tone: "neutral" };
  const ageMin = (Date.now() - refreshedAtMs) / 60000;
  if (ageMin < 5) return { label: "Recently updated", tone: "success" };
  if (ageMin < 60) return { label: "Updated this hour", tone: "success" };
  return { label: "Refresh for latest", tone: "warn" };
}

function lastUpdatedCopy(refreshedAtMs: number | null): string {
  if (refreshedAtMs == null) return "—";
  const ageSec = Math.max(0, Math.round((Date.now() - refreshedAtMs) / 1000));
  if (ageSec < 45) return "Just now";
  if (ageSec < 3600) return `${Math.max(1, Math.round(ageSec / 60))} min ago`;
  return formatUkDateTime(new Date(refreshedAtMs));
}

export function VehicleFleetTrackingCard({
  vehicleId,
  vehicleLabel,
  primaryImei,
  canManageTracking,
}: {
  vehicleId: string;
  vehicleLabel: { vrm: string; make: string; model: string };
  primaryImei?: string | null;
  canManageTracking: boolean;
}) {
  const { refreshShell } = useVehicleWorkspace();
  const [refreshPending, startRefresh] = useTransition();
  const [setPending, startSet] = useTransition();
  const [linkPending, startLink] = useTransition();
  const [snapshot, setSnapshot] = useState<LiveTrackSnapshot | null>(null);
  const [trackingSource, setTrackingSource] = useState<TrackingDataSource | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [weeklyMiles, setWeeklyMiles] = useState<number | null>(null);
  const [weeklyRange, setWeeklyRange] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mileageInput, setMileageInput] = useState("");
  const [setMsg, setSetMsg] = useState<string | null>(null);
  const [refreshedAtMs, setRefreshedAtMs] = useState<number | null>(null);

  const [manualLinkOpen, setManualLinkOpen] = useState(false);
  const [unmatchedDevices, setUnmatchedDevices] = useState<DeviceGroup[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

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
        setWeeklyMiles(null);
        setWeeklyRange(null);
        setRefreshedAtMs(null);
        return;
      }
      setLinked(true);
      setSnapshot(live.snapshot);
      setTrackingSource(live.source);
      setRefreshedAtMs(Date.now());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when tracking tab mounts
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
      const devices = res.deviceCount > 1 ? ` on ${res.deviceCount} devices` : "";
      setSetMsg(
        `Mileage set to ${formatMiles(res.targetMiles, 0)} mi${devices}. The tracker may take a few minutes to update — refresh later to check.`,
      );
      setMileageInput("");
      refresh();
    });
  }

  function openManualLink() {
    setError(null);
    setLinkMsg(null);
    setMappingLoading(true);
    setManualLinkOpen(true);
    startLink(async () => {
      try {
        const res = await loadMappingSuggestionsAction();
        if (!res.ok) {
          setError(res.error);
          setManualLinkOpen(false);
          return;
        }
        setUnmatchedDevices(res.unmatchedDevices);
      } finally {
        setMappingLoading(false);
      }
    });
  }

  function submitManualLink(input: { vehicleId: string; deviceBaseVrm: string }) {
    const group = unmatchedDevices.find((device) => device.baseVrm === input.deviceBaseVrm);
    if (!group) {
      setError("Selected device group is no longer available. Close and try again.");
      return;
    }

    setError(null);
    setLinkMsg(null);
    startLink(async () => {
      const res = await confirmVehicleMappingsAction([
        {
          vehicleId: input.vehicleId,
          primaryImei: group.primaryImei,
          secondaryImei: group.secondaryImei,
        },
      ]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setManualLinkOpen(false);
      setLinkMsg(`Linked ${group.primaryName} to ${vehicleLabel.vrm}.`);
      await refreshShell();
      refresh();
    });
  }

  const initialLoading = linked === null && !error;
  const sourceLine = trackingSource ? describeTrackingDataSource(trackingSource) : null;
  const secondaryNote =
    trackingSource?.hasSecondaryDevice && trackingSource.secondaryDeviceLabel
      ? `Secondary device linked (${trackingSource.secondaryDeviceLabel}) — not used for live readings.`
      : null;
  const freshness = freshnessLabel(refreshedAtMs);
  const deviceImei = snapshot?.imei || primaryImei?.trim() || null;
  const hasFix = snapshot?.latitude != null && snapshot?.longitude != null;

  if (linked === false) {
    return (
      <>
        <div className="rph-card space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">
              SmartCar Tracker
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-rph-fg">Not linked</h2>
            <p className="rph-muted mt-1 text-sm">
              This vehicle is not linked to a SmartCar Tracker device yet.
            </p>
          </div>

          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
          {linkMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{linkMsg}</p> : null}

          {canManageTracking ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rph-btn-primary"
                disabled={linkPending || mappingLoading}
                onClick={openManualLink}
              >
                Link tracker
              </button>
              <Link href="/rental/fleet-tracking" className="rph-link text-sm">
                Open Fleet Tracking settings
              </Link>
            </div>
          ) : (
            <p className="rph-muted text-sm">
              Ask an admin or operations user to link this vehicle on the Fleet Tracking page.
            </p>
          )}
        </div>

        <ManualDeviceLinkModal
          open={manualLinkOpen}
          pending={linkPending || mappingLoading}
          vehicles={[{ id: vehicleId, ...vehicleLabel }]}
          deviceGroups={unmatchedDevices}
          initialVehicleId={vehicleId}
          lockVehicle
          onClose={() => setManualLinkOpen(false)}
          onSubmit={submitManualLink}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900/50 dark:bg-sky-950/30">
        <p className="text-sm text-sky-950 dark:text-sky-100">
          Location is refreshed only when needed. RMS will not poll SmartCar Tracker continuously. Use{" "}
          <span className="font-medium">Refresh location</span> for a new snapshot, or open SmartCar Tracker
          for live tracking.
        </p>
        <button
          type="button"
          className="rph-btn-ghost shrink-0 self-start sm:self-center"
          disabled={refreshPending || setPending || initialLoading}
          onClick={refresh}
        >
          Refresh location
        </button>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {setMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{setMsg}</p> : null}
      {linkMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{linkMsg}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rph-card relative flex flex-col overflow-hidden">
          {initialLoading || refreshPending ? (
            <CardSectionLoader label={initialLoading ? "Loading tracker…" : "Refreshing location…"} />
          ) : null}
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">
                Saved tracker data
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-rph-fg">
                Last recorded location
              </h2>
            </div>
            <StatusPill label={freshness.label} tone={freshness.tone} />
          </div>

          <div className="relative min-h-[14rem] flex-1 bg-rph-chrome/40">
            {hasFix ? (
              <TrackerLocationMap
                latitude={snapshot!.latitude!}
                longitude={snapshot!.longitude!}
                label={vehicleLabel.vrm}
                className="absolute inset-0 h-full w-full"
              />
            ) : !initialLoading ? (
              <div className="flex h-full min-h-[14rem] items-center justify-center px-4 text-center">
                <p className="text-sm text-rph-fg-muted">No GPS fix on the last snapshot.</p>
              </div>
            ) : (
              <div className="min-h-[14rem]" />
            )}
            {hasFix ? (
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto">
                <div className="pointer-events-auto max-w-sm rounded-lg border border-rph-border bg-rph-elevated/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm">
                  <p className="font-semibold text-rph-fg">{vehicleLabel.vrm}</p>
                  <p className="mt-0.5 font-mono text-xs text-rph-fg-secondary">
                    {snapshot!.latitude!.toFixed(5)}, {snapshot!.longitude!.toFixed(5)}
                  </p>
                  {snapshot?.mapUrl ? (
                    <a
                      href={snapshot.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rph-link mt-1 inline-block text-xs"
                    >
                      Open full map
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rph-border px-4 py-3 sm:px-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                Last updated
              </p>
              <p className="mt-0.5 text-sm text-rph-fg">{lastUpdatedCopy(refreshedAtMs)}</p>
              {snapshot?.lastGpsAt ? (
                <p className="rph-meta text-xs">Device GPS: {snapshot.lastGpsAt}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="rph-btn-ghost"
              disabled={refreshPending || setPending || initialLoading}
              onClick={refresh}
            >
              Refresh location
            </button>
          </div>
        </section>

        <section className="rph-card relative flex flex-col overflow-hidden">
          {initialLoading || refreshPending ? (
            <CardSectionLoader label={initialLoading ? "Loading tracker…" : "Refreshing…"} />
          ) : null}
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">
                SmartCar Tracker connection
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-rph-fg">Device details</h2>
              {sourceLine ? (
                <p className="mt-1 text-xs text-rph-fg-secondary">{sourceLine}</p>
              ) : null}
              {secondaryNote ? <p className="rph-meta mt-0.5 text-xs">{secondaryNote}</p> : null}
            </div>
            <StatusPill label="Mapped" tone="success" />
          </div>

          <dl className="flex-1 px-4 py-1 sm:px-5">
            <DetailRow label="Provider">SmartCar Tracker</DetailRow>
            <DetailRow label="Device IMEI">
              <span className="font-mono text-xs sm:text-sm">{deviceImei || "—"}</span>
            </DetailRow>
            <DetailRow label="Status">
              {snapshot ? (
                <>
                  <span className="font-medium">{snapshot.statusLabel}</span>
                  <span className="mt-0.5 block text-xs text-rph-fg-muted">{snapshot.ignitionLabel}</span>
                </>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Speed">
              {snapshot?.speedMph != null ? `${formatMiles(snapshot.speedMph, 0)} mph` : "—"}
            </DetailRow>
            <DetailRow label="Recorded mileage">
              {snapshot?.odometerMiles != null ? (
                <>
                  <span className="font-medium">{formatMiles(snapshot.odometerMiles, 0)} mi</span>
                  <span className="mt-0.5 block text-xs text-rph-fg-muted">SmartCar Tracker</span>
                </>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Today">
              {snapshot?.todayMiles != null ? `${formatMiles(snapshot.todayMiles, 1)} mi` : "—"}
            </DetailRow>
            <DetailRow label="Weekly (7 days)">
              {weeklyMiles != null ? (
                <>
                  <span className="font-medium">{formatMiles(weeklyMiles, 1)} mi</span>
                  {weeklyRange ? (
                    <span className="mt-0.5 block text-xs text-rph-fg-muted">{weeklyRange}</span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Update method">First visit + manual refresh</DetailRow>
          </dl>

          <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-rph-border px-4 py-3 sm:px-5">
            {canManageTracking ? (
              <button
                type="button"
                className="rph-btn-ghost"
                disabled={linkPending || mappingLoading || refreshPending}
                onClick={openManualLink}
              >
                Change mapping
              </button>
            ) : null}
            <a
              href={SMARTCAR_TRACKER_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rph-btn-primary inline-flex items-center gap-1.5"
            >
              Open SmartCar Tracker
              <span aria-hidden>↗</span>
            </a>
          </div>
        </section>
      </div>

      {canManageTracking && !initialLoading ? (
        <section className="rph-card relative p-4 sm:p-5">
          {setPending ? <CardSectionLoader label="Sending mileage to tracker…" /> : null}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">Mileage</p>
          <h2 className="mt-0.5 text-base font-semibold text-rph-fg">Set tracker mileage</h2>
          <p className="rph-muted mt-1 text-sm">
            Optional — only when correcting the device. Enter miles; rounded up and sent as whole kilometres.
            This does not create a maintenance record.
          </p>
          <div
            className={`mt-3 flex flex-wrap items-end gap-2 ${setPending ? "pointer-events-none opacity-60" : ""}`}
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
        </section>
      ) : null}

      <ManualDeviceLinkModal
        open={manualLinkOpen}
        pending={linkPending || mappingLoading}
        vehicles={[{ id: vehicleId, ...vehicleLabel }]}
        deviceGroups={unmatchedDevices}
        initialVehicleId={vehicleId}
        lockVehicle
        onClose={() => setManualLinkOpen(false)}
        onSubmit={submitManualLink}
      />
    </>
  );
}
