"use client";

import type { HireDashboardLifecycle } from "@/app/actions/hire-dashboard";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireDashboardDriverLifecycleCards({
  lifecycle,
  hireStatusLabel,
  startDateLabel,
  rentLabel,
  nextDue,
  contractEnded,
}: {
  lifecycle: HireDashboardLifecycle;
  hireStatusLabel: string;
  startDateLabel: string;
  rentLabel: string | null;
  nextDue: HirePaymentSummary["nextDue"];
  contractEnded?: boolean;
}) {
  const nextPaymentLabel = contractEnded ? "Contract ended" : nextDue ? formatGbp(nextDue.amountGbp) : "—";
  const nextPaymentDate = !contractEnded && nextDue ? formatUkDate(nextDue.periodStart) : null;

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
        <p className="text-xs font-medium text-rph-fg-muted">Rent paid</p>
        <p className="mt-1 font-semibold tabular-nums text-rph-fg">
          {formatGbp(lifecycle.contractPaidGbp)} / {formatGbp(lifecycle.contractTotalGbp)}
        </p>
        <p className="rph-meta mt-1 text-xs">
          {lifecycle.periodsPaidCount} of {lifecycle.periodsTotalCount} rent periods settled
        </p>
      </div>
      <div className="rph-card p-4">
        <p className="text-xs font-medium text-rph-fg-muted">Next payment</p>
        <p className="mt-1 font-semibold tabular-nums text-rph-fg">{nextPaymentLabel}</p>
        {nextPaymentDate ? <p className="rph-meta mt-1 text-xs">{nextPaymentDate}</p> : null}
      </div>
      {contractEnded ? (
        <div className="rph-card p-4 sm:col-span-2 lg:col-span-4">
          <p className="text-xs font-medium text-rph-fg-muted">Accounts closure</p>
          <p className="mt-1 font-semibold text-rph-fg">
            {lifecycle.financialClosure.financiallyClosed ? "Hire accounts closed" : "Action required"}
          </p>
          <p className="rph-meta mt-1 text-xs">
            {lifecycle.financialClosure.depositPendingReview && lifecycle.financialClosure.depositGbp > 0
              ? `Deposit of ${formatGbp(lifecycle.financialClosure.depositGbp)} pending review`
              : lifecycle.depositStatusLabel}
          </p>
        </div>
      ) : null}
    </section>
  );
}
