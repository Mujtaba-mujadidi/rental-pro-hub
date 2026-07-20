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
import type { MappingSuggestion, DeviceGroup } from "@/lib/fleet-tracking/mapping";
import { formatMiles } from "@/lib/fleet-tracking/units";

type FleetTrackingTab = "connection" | "mapping" | "reports";

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

  function loadSuggestions() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
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
      setMessage(
        res.suggestions.length
          ? `Found ${res.suggestions.length} suggested mapping(s).`
          : "No VRM matches between fleet vehicles and tracker devices.",
      );
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
              <button type="button" className="rph-btn-ghost" disabled={busy} onClick={loadSuggestions}>
                Suggest mappings
              </button>
            ) : null}
          </div>

          {!suggestions.length ? (
            <p className="rph-muted text-sm">
              {canManage
                ? "Run suggest mappings to match tracker devices to your fleet VRMs."
                : "No mapping suggestions loaded yet."}
            </p>
          ) : null}

          {suggestions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-rph-border text-xs uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    <th className="py-2 pr-2 font-semibold">{canManage ? "Link" : ""}</th>
                    <th className="py-2 pr-2 font-semibold">Vehicle</th>
                    <th className="py-2 pr-2 font-semibold">Primary device</th>
                    <th className="py-2 font-semibold">Secondary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rph-border">
                  {suggestions.map((s) => (
                    <tr key={s.vehicleId}>
                      <td className="py-2.5 pr-2 align-top">
                        {canManage ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-rph-border"
                            checked={Boolean(selected[s.vehicleId])}
                            disabled={busy}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [s.vehicleId]: e.target.checked }))
                            }
                          />
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 align-top">
                        <p className="font-semibold text-rph-fg">{s.vrm}</p>
                        <p className="rph-meta">
                          {s.make} {s.model}
                          {s.alreadyLinked ? " · already linked" : ""}
                        </p>
                      </td>
                      <td className="py-2.5 pr-2 align-top font-mono text-xs">
                        <p>{s.primaryName}</p>
                        <p className="text-rph-fg-muted">{s.primaryImei}</p>
                      </td>
                      <td className="py-2.5 align-top font-mono text-xs">
                        {s.secondaryName ? (
                          <>
                            <p>{s.secondaryName}</p>
                            <p className="text-rph-fg-muted">{s.secondaryImei}</p>
                          </>
                        ) : (
                          <span className="text-rph-fg-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {canManage && suggestions.length ? (
            <button type="button" className="rph-btn-primary" disabled={busy} onClick={confirmMappings}>
              Confirm selected mappings
            </button>
          ) : null}

          {(unmatchedDevices.length > 0 || unmatchedVehicles.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {unmatchedDevices.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Unmatched devices</p>
                  <ul className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
                    {unmatchedDevices.map((d) => (
                      <li key={d.baseVrm} className="font-mono text-xs">
                        {d.primaryName}
                        {d.secondaryName ? ` + ${d.secondaryName}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {unmatchedVehicles.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Unmatched vehicles</p>
                  <ul className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
                    {unmatchedVehicles.map((v) => (
                      <li key={v.id}>
                        {v.vrm} · {v.make} {v.model}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
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

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
