"use client";

import type { HireDashboardLifecycle } from "@/app/actions/hire-dashboard";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireDashboardLifecycleCards({
  lifecycle,
  hireStatusLabel,
  startDateLabel,
  rentLabel,
}: {
  lifecycle: HireDashboardLifecycle;
  hireStatusLabel: string;
  startDateLabel: string;
  rentLabel: string | null;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rph-card p-4">
        <p className="text-xs font-medium text-rph-fg-muted">Hire status</p>
        <p className="mt-1 font-semibold text-rph-fg">{hireStatusLabel}</p>
        <p className="rph-meta mt-1 text-xs">Started {startDateLabel}</p>
      </div>
      <div className="rph-card p-4">
        <p className="text-xs font-medium text-rph-fg-muted">On hire</p>
        <p className="mt-1 font-semibold tabular-nums text-rph-fg">Day {lifecycle.daysOnHire}</p>
        {rentLabel ? <p className="rph-meta mt-1 text-xs">{rentLabel}</p> : null}
      </div>
      <div className="rph-card p-4">
        <p className="text-xs font-medium text-rph-fg-muted">Contract progress</p>
        <p className="mt-1 font-semibold tabular-nums text-rph-fg">
          {formatGbp(lifecycle.contractPaidGbp)} / {formatGbp(lifecycle.contractTotalGbp)}
        </p>
        <p className="rph-meta mt-1 text-xs">
          {lifecycle.periodsPaidCount} of {lifecycle.periodsTotalCount} periods settled
        </p>
      </div>
      <div className="rph-card p-4">
        <p className="text-xs font-medium text-rph-fg-muted">Deposit & documents</p>
        <p className="mt-1 font-semibold text-rph-fg">{lifecycle.depositStatusLabel}</p>
        <p className="rph-meta mt-1 text-xs">{lifecycle.documentsStatusLabel}</p>
      </div>
    </section>
  );
}
