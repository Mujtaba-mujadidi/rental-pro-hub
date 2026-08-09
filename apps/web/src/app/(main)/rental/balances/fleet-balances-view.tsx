"use client";

import { listHireOpenBalancesAction, type HireOpenBalanceRow } from "@/app/actions/rental-hire-termination";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { RphPageHeader } from "@/components/ui/rph-toolbar";
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
      <RphPageHeader
        title="Open balances"
        description="Settlement balances after contracts end. Open a hire to record notes and phased payments."
        actions={
          <button type="button" className="rph-btn-ghost" disabled={pending} onClick={reload}>
            Refresh
          </button>
        }
      />

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {rows.length === 0 && !pending ? (
        <p className="rph-muted text-sm">No open balances right now.</p>
      ) : (
        <div className="rph-table-responsive">
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
                  <td data-label="Vehicle" className="rph-table-primary px-4 py-3 font-medium text-rph-fg">
                    {row.vehicleVrm ?? "—"}
                  </td>
                  <td data-label="Driver" className="px-4 py-3 text-rph-fg-secondary">
                    <span className="rph-table-cell-value">{row.driverLabel ?? "—"}</span>
                  </td>
                  <td data-label="Ended" className="px-4 py-3 text-rph-fg-secondary">
                    <span className="rph-table-cell-value">
                      {row.terminatedAt ? formatUkDateTime(row.terminatedAt) : "—"}
                    </span>
                  </td>
                  <td data-label="Balance" className="px-4 py-3 font-semibold tabular-nums text-rph-fg">
                    <span className="rph-table-cell-value">
                      {settlementBalanceLabel(row.settlementDirection, row.openBalanceGbp)}
                    </span>
                  </td>
                  <td data-label="" className="rph-table-actions px-4 py-3 text-right">
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
