"use client";

import { loadDriverHireSettlementAction, type DriverHireSettlementView } from "@/app/actions/rental-hire-termination";
import { formatGbp } from "@/lib/fleet/maintenance";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireSettlementPage() {
  const { shell } = useDriverHireWorkspace();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DriverHireSettlementView | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHireSettlementAction(shell.hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
    });
  }, [shell.hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!data && pending) {
    return <p className="rph-muted text-sm" role="status">Loading settlement…</p>;
  }
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Settlement</h1>
        <p className="rph-muted mt-1 text-sm">
          Final account balance after your contract ended
          {shell.terminatedAtLabel ? ` on ${shell.terminatedAtLabel}` : ""}.
        </p>
      </div>

      <section className="rph-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Balance</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
          {data.settled
            ? "Settled — no balance outstanding"
            : settlementBalanceLabel(data.settlementDirection, data.openBalanceGbp)}
        </p>
        {!data.settled ? (
          <p className="rph-muted mt-2 text-sm">
            Contact {shell.companyName} if you need to arrange payment or discuss this balance.
          </p>
        ) : null}
      </section>

      {data.payments.length ? (
        <section className="overflow-hidden rounded-xl border border-rph-border">
          <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
            <h2 className="text-sm font-semibold text-rph-fg">Settlement payments</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Reference</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => (
                <tr key={payment.id} className="border-t border-rph-border">
                  <td className="px-4 py-3 text-rph-fg-secondary">{formatUkDateTime(payment.paidAt)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-rph-fg">
                    {formatGbp(payment.amountGbp)}
                  </td>
                  <td className="px-4 py-3 text-rph-fg-secondary">{payment.paymentReference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
