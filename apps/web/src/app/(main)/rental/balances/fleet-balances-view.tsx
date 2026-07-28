"use client";

import { listHireOpenBalancesAction, type HireOpenBalanceRow } from "@/app/actions/rental-hire-termination";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import { formatUkDateTime } from "@/lib/datetime/uk";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

export function FleetBalancesView() {
  const [rows, setRows] = useState<HireOpenBalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await listHireOpenBalancesAction();
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="rph-h1">Open balances</h1>
          <p className="rph-muted mt-1 text-sm">
            Settlement balances after contracts end. Open a hire to record notes and phased payments.
          </p>
        </div>
        <button type="button" className="rph-btn-ghost" disabled={pending} onClick={reload}>
          Refresh
        </button>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {rows.length === 0 && !pending ? (
        <p className="rph-muted text-sm">No open balances right now.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-rph-border">
          <table className="min-w-full text-sm">
            <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Ended</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.hireGroupId} className="border-t border-rph-border hover:bg-rph-chrome/40">
                  <td className="px-4 py-3 font-medium text-rph-fg">{row.vehicleVrm ?? "—"}</td>
                  <td className="px-4 py-3 text-rph-fg-secondary">{row.driverLabel ?? "—"}</td>
                  <td className="px-4 py-3 text-rph-fg-secondary">
                    {row.terminatedAt ? formatUkDateTime(row.terminatedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-rph-fg">
                    {settlementBalanceLabel(row.settlementDirection, row.openBalanceGbp)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/rental/balances/${row.hireGroupId}`}
                      className="rph-btn-ghost h-9 px-3 text-xs"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
