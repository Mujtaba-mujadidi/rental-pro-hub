"use client";

import { loadDriverHireHistoryAction } from "@/app/actions/driver-hires";
import type { DriverHireHistoryRow } from "@/lib/fleet/driver-hire-types";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";
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

function HireHistoryCard({ row }: { row: DriverHireHistoryRow }) {
  const workspaceHref = driverHireWorkspaceHref(row.hireGroupId);

  return (
    <li className="rph-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <Link href={workspaceHref} className="min-w-0 flex-1 hover:opacity-90">
          <p className="font-medium text-rph-fg">{row.companyName}</p>
          <p className="rph-meta text-sm">
            {row.vehicleVrm} · {row.vehicleMakeModel}
          </p>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={row.statusLabel} status={row.status} />
          <Link href={workspaceHref} className="rph-btn-primary h-9 px-3 text-xs">
            Open hire
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-rph-border px-4 py-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Start</dt>
          <dd className="mt-0.5 text-rph-fg-secondary">{row.startDateLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Ended</dt>
          <dd className="mt-0.5 text-rph-fg-secondary">
            {row.terminatedAtLabel ?? row.endDateLabel ?? "—"}
          </dd>
        </div>
      </dl>

      {row.signedAgreementCount > 0 ? (
        <div className="border-t border-rph-border px-4 py-3">
          <Link
            href={driverHireWorkspaceHref(row.hireGroupId, "details")}
            className="text-sm font-medium text-rph-link hover:text-rph-link-hover"
          >
            View signed document{row.signedAgreementCount === 1 ? "" : "s"}
          </Link>
        </div>
      ) : null}
    </li>
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
          <p className="rph-muted mt-1 text-sm">
            Past hires with rental companies. Use <span className="font-medium text-rph-fg">Open hire</span> to
            view payments, settlement, and checkout records.
          </p>
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
            <HireHistoryCard key={row.hireGroupId} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
