"use client";

import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rph-card p-4">
      <p className="text-xs font-medium text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg">{value}</p>
      {hint ? <p className="rph-meta mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

function CompactStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-rph-fg">{value}</p>
      {sub ? <p className="truncate text-[10px] text-rph-fg-muted">{sub}</p> : null}
    </div>
  );
}

export function HirePaymentSummaryCards({
  summary,
  showDiscountTotal,
  compact,
  contractEnded,
}: {
  summary: HirePaymentSummary;
  /** Staff see full-contract rent value below the compact row. */
  showDiscountTotal?: boolean;
  /** Dense single-row stats for the payments page header. */
  compact?: boolean;
  /** Ended hire — accrued scope is through contract end. */
  contractEnded?: boolean;
}) {
  const rentDueLabel = contractEnded ? "Rent due (contract)" : "Rent due (to date)";
  const nextDueAmount = contractEnded
    ? "Contract ended"
    : summary.nextDue
      ? formatGbp(summary.nextDue.amountGbp)
      : "—";
  const nextDueDate =
    !contractEnded && summary.nextDue ? formatUkDate(summary.nextDue.periodStart) : null;

  if (compact) {
    return (
      <section className="rph-card p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <CompactStat label={rentDueLabel} value={formatGbp(summary.rentGrossAccruedGbp)} />
          <CompactStat label="Total discount" value={formatGbp(summary.totalDiscountGbp)} />
          <CompactStat label="Net rent" value={formatGbp(summary.totalDueGbp)} />
          <CompactStat label="Balance" value={formatGbp(summary.balanceGbp)} />
          <CompactStat
            label="Next payment"
            value={nextDueAmount}
            sub={nextDueDate ?? undefined}
          />
        </div>
        {contractEnded ? (
          <p className="mt-2.5 border-t border-rph-border/80 pt-2 text-xs text-rph-fg-muted">
            Final rent totals for the ended contract (deposit excluded). No further rent payments are due.
          </p>
        ) : null}
        {showDiscountTotal ? (
          <p className="mt-2.5 border-t border-rph-border/80 pt-2 text-xs text-rph-fg-muted">
            Paid on accrued rent:{" "}
            <span className="font-semibold text-rph-fg">{formatGbp(summary.totalPaidGbp)}</span>
            <span className="mx-1.5 text-rph-border">·</span>
            Full contract rent (after discounts):{" "}
            <span className="font-semibold text-rph-fg">{formatGbp(summary.contractTotalGbp)}</span>
          </p>
        ) : null}
      </section>
    );
  }

  const nextDueLabel = contractEnded
    ? "Contract ended"
    : summary.nextDue
      ? `${formatGbp(summary.nextDue.amountGbp)} · ${formatUkDate(summary.nextDue.periodStart)}`
      : "—";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryCard label={rentDueLabel} value={formatGbp(summary.rentGrossAccruedGbp)} />
      <SummaryCard label="Total discount" value={formatGbp(summary.totalDiscountGbp)} />
      <SummaryCard label="Net rent" value={formatGbp(summary.totalDueGbp)} />
      <SummaryCard label="Balance" value={formatGbp(summary.balanceGbp)} />
      <SummaryCard label="Next payment" value={nextDueLabel} />
      {showDiscountTotal ? (
        <div className="sm:col-span-2 lg:col-span-5">
          <SummaryCard
            label="Paid on accrued rent"
            value={formatGbp(summary.totalPaidGbp)}
            hint={`Full contract rent after discounts: ${formatGbp(summary.contractTotalGbp)}`}
          />
        </div>
      ) : null}
    </div>
  );
}
