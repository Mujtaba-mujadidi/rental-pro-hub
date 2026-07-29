"use client";

import { formatUkDate } from "@/lib/datetime/uk";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { formatGbp } from "@/lib/fleet/maintenance";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-rph-border bg-rph-chrome/30 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-rph-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-rph-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function HireOverviewPaymentSummary({
  summary,
  contractEnded,
}: {
  summary: HirePaymentSummary;
  contractEnded: boolean;
}) {
  const rentPrefix = contractEnded ? "Total rent" : "Rent";
  const balanceValue =
    summary.balanceGbp > 0
      ? formatGbp(summary.balanceGbp)
      : summary.creditGbp > 0
        ? formatGbp(summary.creditGbp)
        : formatGbp(0);
  const balanceLabel =
    summary.balanceGbp > 0 ? "Still owed" : summary.creditGbp > 0 ? "Rent credit" : "Balance";

  const nextPayment =
    contractEnded || !summary.nextDue
      ? contractEnded
        ? "Contract ended"
        : "—"
      : `${formatGbp(summary.nextDue.amountGbp)} · ${formatUkDate(summary.nextDue.periodStart)}`;

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Payment summary</h2>
      <p className="rph-muted mt-1 text-xs">
        {contractEnded
          ? "Totals for the full contract (deposit not included)."
          : "Totals for rent weeks that have started so far (deposit not included)."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={`${rentPrefix} (before discount)`} value={formatGbp(summary.rentGrossAccruedGbp)} />
        <Stat label={contractEnded ? "Total discount" : "Discount so far"} value={formatGbp(summary.totalDiscountGbp)} />
        <Stat
          label={contractEnded ? "Total rent after discount" : "Rent after discount (so far)"}
          value={formatGbp(summary.totalDueGbp)}
        />
        <Stat label="Paid" value={formatGbp(summary.totalPaidGbp)} />
        <Stat label={balanceLabel} value={balanceValue} />
        {!contractEnded ? <Stat label="Next payment" value={nextPayment} /> : null}
      </div>
    </section>
  );
}
