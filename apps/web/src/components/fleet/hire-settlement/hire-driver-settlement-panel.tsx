"use client";

import {
  loadDriverHireSettlementAction,
  type DriverHireSettlementView,
} from "@/app/actions/rental-hire-termination";
import { HireDriverChargesTable } from "@/components/fleet/hire-payments/hire-driver-charges-table";
import { HireSettlementBalancePaymentsTable } from "@/components/fleet/hire-payments/hire-settlement-balance-payments-table";
import { HireSettlementBreakdownPanel } from "@/components/fleet/hire-settlement/hire-settlement-breakdown-panel";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import { useCallback, useEffect, useState, useTransition } from "react";

export function HireDriverSettlementPanel({
  hireGroupId,
  companyName,
  terminatedAtLabel,
  embedded = false,
}: {
  hireGroupId: string;
  companyName: string;
  terminatedAtLabel?: string | null;
  embedded?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DriverHireSettlementView | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHireSettlementAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
    });
  }, [hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading settlement…</p>
      </div>
    );
  }

  if (error && !data) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {embedded ? (
        <div>
          <h1 className="rph-h1">Balance after contract end</h1>
          <p className="rph-muted mt-1 text-sm">
            Money still owed or to be refunded after your contract ended
            {terminatedAtLabel ? ` on ${terminatedAtLabel}` : ""}.
          </p>
        </div>
      ) : null}

      <section className="rph-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Still owed</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
          {data.settled
            ? "All clear — nothing owed"
            : settlementBalanceLabel(data.settlementDirection, data.openBalanceGbp, "driver")}
        </p>
        {!data.settled ? (
          <p className="rph-muted mt-2 text-sm">
            Contact {companyName} if you need to arrange payment or discuss this balance.
          </p>
        ) : null}
      </section>

      {data.settlementBreakdown ? (
        <HireSettlementBreakdownPanel breakdown={data.settlementBreakdown} audience="driver" />
      ) : null}

      <HireDriverChargesTable
        items={data.driverChargeLineItems}
        description="Charges from check-in and other events on this hire."
        audience="driver"
      />

      <HireSettlementBalancePaymentsTable payments={data.payments} contractEnded audience="driver" />
    </div>
  );
}
