"use client";

import { loadDriverHireHistoryAction, type DriverHireHistoryRow } from "@/app/actions/driver-hires";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { driverHireDocumentsPath, driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import { useDriverHireAccessRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useCallback, useEffect, useTransition } from "react";
import { useState } from "react";

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">{label}</p>
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(driverHireStatusTone(status))}`}
    >
      {label}
    </span>
  );
}

export function DriverHireHistoryClient() {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<DriverHireHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHireHistoryAction();
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      setRows(res.rows);
      setError(null);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useDriverHireAccessRealtime(reload);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="rph-h1">Hire history</h1>
          <p className="rph-muted mt-1 text-sm">Past hires with rental companies.</p>
        </div>
        <button type="button" className="rph-btn-ghost" disabled={pending || rows === null} onClick={reload}>
          Refresh
        </button>
      </div>

      {pending && rows === null ? <LoadingPanel label="Loading hire history…" /> : null}
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {rows !== null && !rows.length ? (
        <p className="rph-muted text-sm">No past hires yet.</p>
      ) : null}

      {rows?.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.hireGroupId} className="rph-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-rph-fg">{row.companyName}</p>
                  <p className="rph-meta text-sm">
                    {row.vehicleVrm} · {row.vehicleMakeModel}
                  </p>
                </div>
                <StatusPill label={row.statusLabel} status={row.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-rph-fg-muted">Start</dt>
                  <dd className="font-medium text-rph-fg">{row.startDateLabel}</dd>
                </div>
                {row.endDateLabel ? (
                  <div>
                    <dt className="text-rph-fg-muted">Ended</dt>
                    <dd className="font-medium text-rph-fg">{row.endDateLabel}</dd>
                  </div>
                ) : null}
              </dl>
              {row.signedAgreementCount > 0 ? (
                <div className="mt-4">
                  <Link
                    href={driverHireDocumentsPath(row.hireGroupId, "hire-history")}
                    className="rph-btn-ghost h-9 px-3 text-xs"
                  >
                    View signed document{row.signedAgreementCount === 1 ? "" : "s"}
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
