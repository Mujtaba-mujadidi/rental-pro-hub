"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  confirmVehicleMappingsAction,
  loadFleetTrackingSettingsAction,
  loadMappingSuggestionsAction,
  loadWeeklyMileageReportAction,
  saveFleetTrackingCredentialsAction,
  testFleetTrackingConnectionAction,
  type FleetTrackingSettings,
  type WeeklyMileageRow,
} from "@/app/actions/fleet-tracking";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ManualDeviceLinkModal } from "@/app/(main)/rental/fleet-tracking/manual-device-link-modal";
import type { MappingSuggestion, DeviceGroup } from "@/lib/fleet-tracking/mapping";
import { formatMiles } from "@/lib/fleet-tracking/units";

type FleetTrackingTab = "connection" | "mapping" | "reports";

function SectionLoader({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-rph-raised/90 backdrop-blur-[1px]"
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

export function FleetTrackingClient({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<FleetTrackingTab>("connection");
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [settings, setSettings] = useState<FleetTrackingSettings | null>(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [unmatchedDevices, setUnmatchedDevices] = useState<DeviceGroup[]>([]);
  const [unmatchedVehicles, setUnmatchedVehicles] = useState<
    { id: string; vrm: string; make: string; model: string }[]
  >([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [unmatchedExpanded, setUnmatchedExpanded] = useState(false);
  const [manualLinkOpen, setManualLinkOpen] = useState(false);
  const [manualLinkVehicleId, setManualLinkVehicleId] = useState<string | null>(null);
  const [manualLinkDeviceBaseVrm, setManualLinkDeviceBaseVrm] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<{
    beginLabel: string;
    endLabel: string;
    rows: WeeklyMileageRow[];
  } | null>(null);

  const busy = pending || overlay?.phase === "pending";

  const refreshSettings = useCallback(() => {
    startTransition(async () => {
      const res = await loadFleetTrackingSettingsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSettings(res.settings);
      setAccount(res.settings.account ?? "");
    });
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  function switchTab(next: FleetTrackingTab) {
    setError(null);
    setMessage(null);
    setTab(next);
  }

  function saveCredentials() {
    setError(null);
    setMessage(null);
    setOverlay({
      phase: "pending",
      title: "Saving credentials…",
      detail: "Encrypting and storing your SmartCar Tracker login, then checking the connection.",
    });
    startTransition(async () => {
      const res = await saveFleetTrackingCredentialsAction({ account, password });
      if (!res.ok) {
        setOverlay({
          phase: "error",
          title: "Could not save credentials",
          detail: res.error,
        });
        setError(res.error);
        return;
      }
      setPassword("");
      if (res.connectionWarning) {
        setOverlay({
          phase: "success",
          title: "Credentials saved",
          detail: `Your account and password are stored. Connection check failed: ${res.connectionWarning}`,
        });
        setMessage("Credentials saved on this company (password encrypted).");
        setError(res.connectionWarning);
      } else {
        setOverlay({
          phase: "success",
          title: "Credentials saved",
          detail: "Stored securely and connection to SmartCar Tracker verified.",
        });
        setMessage("Credentials saved and connection verified.");
      }
      refreshSettings();
    });
  }

  function testConnection() {
    setError(null);
    setMessage(null);
    setOverlay({
      phase: "pending",
      title: "Testing connection…",
      detail: "Signing in to SmartCar Tracker and loading the device list.",
    });
    startTransition(async () => {
      const res = await testFleetTrackingConnectionAction();
      if (!res.ok) {
        setOverlay({
          phase: "error",
          title: "Connection failed",
          detail: res.error,
        });
        setError(res.error);
        return;
      }
      setOverlay({
        phase: "success",
        title: "Connected",
        detail: `${res.deviceCount} device(s) found on this account.`,
      });
      setMessage(`Connected. ${res.deviceCount} device(s) on this account.`);
    });
  }

  function loadSuggestions(options?: { successMessage?: string }) {
    setError(null);
    if (!options?.successMessage) setMessage(null);
    setSuggestionsLoading(true);
    startTransition(async () => {
      try {
        const res = await loadMappingSuggestionsAction();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuggestions(res.suggestions);
        setUnmatchedDevices(res.unmatchedDevices);
        setUnmatchedVehicles(res.unmatchedVehicles);
        const next: Record<string, boolean> = {};
        for (const s of res.suggestions) {
          next[s.vehicleId] = !s.alreadyLinked;
        }
        setSelected(next);
        setSuggestionsLoaded(true);
        setMessage(
          options?.successMessage ??
            (res.suggestions.length
              ? `Found ${res.suggestions.length} suggested mapping(s).`
              : "No VRM matches between fleet vehicles and tracker devices."),
        );
      } finally {
        setSuggestionsLoading(false);
      }
    });
  }

  const selectedCount = suggestions.filter((s) => selected[s.vehicleId]).length;
  const allSelected = suggestions.length > 0 && selectedCount === suggestions.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const unmatchedCount = unmatchedDevices.length + unmatchedVehicles.length;

  function selectAllMappings() {
    const next: Record<string, boolean> = {};
    for (const s of suggestions) next[s.vehicleId] = true;
    setSelected(next);
  }

  function unselectAllMappings() {
    const next: Record<string, boolean> = {};
    for (const s of suggestions) next[s.vehicleId] = false;
    setSelected(next);
  }

  function toggleAllMappings(checked: boolean) {
    if (checked) selectAllMappings();
    else unselectAllMappings();
  }

  function openManualLink(input?: { vehicleId?: string; deviceBaseVrm?: string }) {
    setManualLinkVehicleId(input?.vehicleId ?? null);
    setManualLinkDeviceBaseVrm(input?.deviceBaseVrm ?? null);
    setManualLinkOpen(true);
  }

  function submitManualLink(input: { vehicleId: string; deviceBaseVrm: string }) {
    const group = unmatchedDevices.find((device) => device.baseVrm === input.deviceBaseVrm);
    if (!group) {
      setError("Selected device group is no longer available. Refresh suggestions and try again.");
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
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
      loadSuggestions({ successMessage: `Linked ${group.primaryName} to vehicle.` });
    });
  }

  function confirmMappings() {
    const links = suggestions
      .filter((s) => selected[s.vehicleId])
      .map((s) => ({
        vehicleId: s.vehicleId,
        primaryImei: s.primaryImei,
        secondaryImei: s.secondaryImei,
      }));
    if (!links.length) {
      setError("Select at least one suggested mapping to confirm.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await confirmVehicleMappingsAction(links);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(`Linked ${res.updated} vehicle(s).`);
      loadSuggestions();
    });
  }

  function loadWeekly() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await loadWeeklyMileageReportAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setWeekly({ beginLabel: res.beginLabel, endLabel: res.endLabel, rows: res.rows });
    });
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <h1 className="rph-h1">Fleet Tracking</h1>
        <p className="rph-muted text-sm">{pending ? "Loading…" : error ?? "Loading…"}</p>
      </div>
    );
  }

  if (!settings.enabled) {
    return (
      <div className="space-y-4">
        <h1 className="rph-h1">Fleet Tracking</h1>
        <p className="rph-muted text-sm">
          Fleet Tracking is not enabled for your company. Ask your platform administrator to enable SmartCar Tracker
          access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Fleet Tracking</h1>
        <p className="rph-muted mt-1 text-sm">
          Connect SmartCar Tracker, map devices to your fleet VRMs, and review mileage reports.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Fleet tracking sections"
        className="inline-flex flex-wrap rounded-xl bg-rph-chrome p-1 ring-1 ring-rph-border"
      >
        {(
          [
            ["connection", "Connection"],
            ["mapping", "Device mapping"],
            ["reports", "Reports"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === id ? "bg-rph-raised text-rph-fg shadow-sm" : "text-rph-fg-secondary hover:text-rph-fg"
            }`}
            onClick={() => switchTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p> : null}

      <div role="tabpanel" hidden={tab !== "connection"} className={tab === "connection" ? "space-y-4" : undefined}>
        <section className="rph-card space-y-4 p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">API connection</h2>
          <p className="rph-meta">
            Enter the SmartCar Tracker Open API account for this company. Passwords are encrypted at rest and never
            shown again.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-rph-fg-muted">Account</span>
              <input
                className="rph-input"
                value={account}
                disabled={!canManage || busy}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-rph-fg-muted">
                Password {settings.hasPassword ? "(leave blank to keep current)" : ""}
              </span>
              <input
                type="password"
                className="rph-input"
                value={password}
                disabled={!canManage || busy}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={settings.hasPassword ? "••••••••" : ""}
              />
            </label>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="rph-btn-primary" disabled={busy} onClick={saveCredentials}>
                {busy && overlay?.phase === "pending" ? "Saving…" : "Save credentials"}
              </button>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-semibold text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50"
                disabled={busy}
                onClick={testConnection}
              >
                Test connection
              </button>
            </div>
          ) : (
            <p className="rph-meta">You need owner, admin, or operations access to change credentials.</p>
          )}
        </section>
      </div>

      <div role="tabpanel" hidden={tab !== "mapping"} className={tab === "mapping" ? "space-y-4" : undefined}>
        <section className="rph-card space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Device mapping</h2>
              <p className="rph-meta mt-1">
                Matches ignore spaces and case. When both <span className="font-mono">VRM</span> and{" "}
                <span className="font-mono">VRM-imob</span> exist, the immobiliser device is primary.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                className="rph-btn-ghost inline-flex items-center gap-2"
                disabled={busy || suggestionsLoading}
                onClick={() => loadSuggestions()}
              >
                {suggestionsLoading ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-rph-border border-t-rph-rail"
                      aria-hidden
                    />
                    Suggesting…
                  </>
                ) : (
                  "Suggest mappings"
                )}
              </button>
            ) : null}
          </div>

          <div className="relative min-h-[8rem]">
            {suggestionsLoading ? <SectionLoader label="Matching devices to fleet VRMs…" /> : null}

            {!suggestionsLoading && !suggestions.length ? (
              <p className="rph-muted text-sm">
                {canManage
                  ? suggestionsLoaded
                    ? "No VRM matches found. Check device names on SmartCar Tracker match your fleet registrations."
                    : "Run suggest mappings to match tracker devices to your fleet VRMs."
                  : "No mapping suggestions loaded yet."}
              </p>
            ) : null}

            {!suggestionsLoading && suggestions.length ? (
              <div className="space-y-3">
                {canManage ? (
                  <p className="text-sm text-rph-fg-secondary">
                    <span className="font-semibold text-rph-fg">{selectedCount}</span> of{" "}
                    <span className="font-semibold text-rph-fg">{suggestions.length}</span> selected
                  </p>
                ) : null}

                <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-xl border border-rph-border">
                  <table className="min-w-full divide-y divide-rph-border text-sm">
                    <thead className="sticky top-0 z-10 bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                      <tr>
                        {canManage ? (
                          <th className="w-12 px-4 py-3 font-semibold">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-rph-border"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected;
                              }}
                              disabled={busy}
                              aria-label="Select all mappings"
                              onChange={(e) => toggleAllMappings(e.target.checked)}
                            />
                          </th>
                        ) : null}
                        <th className="px-4 py-3 font-semibold">Vehicle</th>
                        <th className="px-4 py-3 font-semibold">Primary device</th>
                        <th className="px-4 py-3 font-semibold">Secondary device</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rph-border bg-rph-raised">
                      {suggestions.map((s) => {
                        const isSelected = Boolean(selected[s.vehicleId]);
                        return (
                          <tr
                            key={s.vehicleId}
                            className={`transition-colors hover:bg-rph-chrome/60 ${
                              isSelected ? "bg-rph-rail/5 dark:bg-rph-rail-soft/10" : ""
                            }`}
                          >
                            {canManage ? (
                              <td className="px-4 py-3 align-top">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-rph-border"
                                  checked={isSelected}
                                  disabled={busy}
                                  aria-label={`Link ${s.vrm}`}
                                  onChange={(e) =>
                                    setSelected((prev) => ({ ...prev, [s.vehicleId]: e.target.checked }))
                                  }
                                />
                              </td>
                            ) : null}
                            <td className="px-4 py-3 align-top">
                              <p className="font-mono font-semibold text-rph-fg">{s.vrm}</p>
                              <p className="mt-0.5 text-rph-fg-secondary">
                                {s.make} {s.model}
                              </p>
                              {s.alreadyLinked ? (
                                <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                  Already linked
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="font-medium text-rph-fg">{s.primaryName}</p>
                              <p className="mt-0.5 font-mono text-xs text-rph-fg-muted">{s.primaryImei}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {s.secondaryName ? (
                                <>
                                  <p className="font-medium text-rph-fg">{s.secondaryName}</p>
                                  <p className="mt-0.5 font-mono text-xs text-rph-fg-muted">{s.secondaryImei}</p>
                                </>
                              ) : (
                                <span className="text-rph-fg-muted">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {canManage ? (
                  <div className="rph-btn-modal-footer">
                    <button type="button" className="rph-btn-primary" disabled={busy || selectedCount === 0} onClick={confirmMappings}>
                      Confirm selected mappings
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {(unmatchedDevices.length > 0 || unmatchedVehicles.length > 0) && !suggestionsLoading ? (
            <div className="border-t border-rph-border pt-4">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-rph-chrome/60"
                aria-expanded={unmatchedExpanded}
                onClick={() => setUnmatchedExpanded((open) => !open)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <svg
                    className={`h-4 w-4 shrink-0 text-rph-fg-muted transition-transform ${unmatchedExpanded ? "rotate-90" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01-.02-1.06L10.94 10 7.19 6.29a.75.75 0 111.04-1.08l4.25 3.95a.75.75 0 010 1.08l-4.25 3.95a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Unmatched</span>
                    <span className="mt-0.5 block text-sm text-rph-fg-secondary">
                      {unmatchedDevices.length
                        ? `${unmatchedDevices.length} device group${unmatchedDevices.length === 1 ? "" : "s"}`
                        : null}
                      {unmatchedDevices.length && unmatchedVehicles.length ? " · " : null}
                      {unmatchedVehicles.length
                        ? `${unmatchedVehicles.length} vehicle${unmatchedVehicles.length === 1 ? "" : "s"}`
                        : null}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-rph-chrome px-2.5 py-0.5 text-xs font-semibold text-rph-fg-secondary ring-1 ring-rph-border">
                  {unmatchedCount}
                </span>
              </button>

              {unmatchedExpanded ? (
                <div className="mt-3 space-y-4">
                  {canManage && unmatchedDevices.length > 0 && unmatchedVehicles.length > 0 ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="rph-btn-ghost"
                        disabled={busy}
                        onClick={() => openManualLink()}
                      >
                        Link manually
                      </button>
                    </div>
                  ) : null}

                  {unmatchedDevices.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Unmatched devices</p>
                      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-xl border border-rph-border">
                        <table className="min-w-full divide-y divide-rph-border text-sm">
                          <thead className="sticky top-0 z-10 bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Device label</th>
                              <th className="px-4 py-3 font-semibold">Primary device</th>
                              <th className="px-4 py-3 font-semibold">Secondary device</th>
                              {canManage ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rph-border bg-rph-raised">
                            {unmatchedDevices.map((d) => (
                              <tr key={d.baseVrm} className="transition-colors hover:bg-rph-chrome/60">
                                <td className="px-4 py-3 align-top">
                                  <p className="font-mono font-semibold text-rph-fg">{d.baseVrm}</p>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <p className="font-medium text-rph-fg">{d.primaryName}</p>
                                  <p className="mt-0.5 font-mono text-xs text-rph-fg-muted">{d.primaryImei}</p>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  {d.secondaryName ? (
                                    <>
                                      <p className="font-medium text-rph-fg">{d.secondaryName}</p>
                                      <p className="mt-0.5 font-mono text-xs text-rph-fg-muted">{d.secondaryImei}</p>
                                    </>
                                  ) : (
                                    <span className="text-rph-fg-muted">—</span>
                                  )}
                                </td>
                                {canManage ? (
                                  <td className="px-4 py-3 align-top">
                                    <button
                                      type="button"
                                      className="rph-btn-ghost !min-h-0 h-9 px-3 text-xs"
                                      disabled={busy || !unmatchedVehicles.length}
                                      onClick={() => openManualLink({ deviceBaseVrm: d.baseVrm })}
                                    >
                                      Link vehicle
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {unmatchedVehicles.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Unmatched vehicles</p>
                      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-xl border border-rph-border">
                        <table className="min-w-full divide-y divide-rph-border text-sm">
                          <thead className="sticky top-0 z-10 bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Vehicle</th>
                              <th className="px-4 py-3 font-semibold">Primary device</th>
                              <th className="px-4 py-3 font-semibold">Secondary device</th>
                              {canManage ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rph-border bg-rph-raised">
                            {unmatchedVehicles.map((v) => (
                              <tr key={v.id} className="transition-colors hover:bg-rph-chrome/60">
                                <td className="px-4 py-3 align-top">
                                  <p className="font-mono font-semibold text-rph-fg">{v.vrm}</p>
                                  <p className="mt-0.5 text-rph-fg-secondary">
                                    {v.make} {v.model}
                                  </p>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span className="text-rph-fg-muted">—</span>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span className="text-rph-fg-muted">—</span>
                                </td>
                                {canManage ? (
                                  <td className="px-4 py-3 align-top">
                                    <button
                                      type="button"
                                      className="rph-btn-ghost !min-h-0 h-9 px-3 text-xs"
                                      disabled={busy || !unmatchedDevices.length}
                                      onClick={() => openManualLink({ vehicleId: v.id })}
                                    >
                                      Link device
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div role="tabpanel" hidden={tab !== "reports"} className={tab === "reports" ? "space-y-4" : undefined}>
        <section className="rph-card space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Reports</h2>
            <p className="rph-meta mt-1">Fleet mileage and other tracker reports for your linked vehicles.</p>
          </div>

          <div className="space-y-4 border-t border-rph-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-rph-fg">Weekly mileage</h3>
                <p className="rph-meta mt-0.5">Last 7 days from the tracker (primary device only), shown in miles.</p>
              </div>
              <button type="button" className="rph-btn-ghost" disabled={busy} onClick={loadWeekly}>
                Load report
              </button>
            </div>
            {weekly ? (
              <>
                <p className="rph-meta">
                  {weekly.beginLabel} → {weekly.endLabel}
                </p>
                {!weekly.rows.length ? (
                  <p className="text-sm text-rph-fg-muted">No linked vehicles yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead className="border-b border-rph-border text-xs uppercase tracking-wide text-rph-fg-muted">
                        <tr>
                          <th className="py-2 pr-2 font-semibold">VRM</th>
                          <th className="py-2 pr-2 font-semibold">Vehicle</th>
                          <th className="py-2 font-semibold">Miles</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rph-border">
                        {weekly.rows.map((r) => (
                          <tr key={r.vehicleId}>
                            <td className="py-2 pr-2 font-semibold">{r.vrm}</td>
                            <td className="py-2 pr-2 text-rph-fg-secondary">
                              {r.make} {r.model}
                            </td>
                            <td className="py-2">
                              {r.unavailable || r.miles == null ? "—" : formatMiles(r.miles, 1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="rph-muted text-sm">Load the weekly mileage report to see distance per linked vehicle.</p>
            )}
          </div>
        </section>
      </div>

      <ManualDeviceLinkModal
        open={manualLinkOpen}
        pending={pending}
        vehicles={unmatchedVehicles}
        deviceGroups={unmatchedDevices}
        initialVehicleId={manualLinkVehicleId}
        initialDeviceBaseVrm={manualLinkDeviceBaseVrm}
        onClose={() => setManualLinkOpen(false)}
        onSubmit={submitManualLink}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
