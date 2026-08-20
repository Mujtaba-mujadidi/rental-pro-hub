"use client";

import type { HireTerminationAccountsSummary, HireUiAudience } from "@/lib/fleet/hire-termination-summary";
import {
  overallTerminationPositionGbp,
  settlementBalanceLabel,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireTerminationSummaryCard({
  summary,
  depositDispositionLabel,
  settlementResolutionLabel,
  audience = "staff",
}: {
  summary: HireTerminationAccountsSummary;
  depositDispositionLabel: string | null;
  settlementResolutionLabel: string | null;
  audience?: HireUiAudience;
}) {
  const isDriver = audience === "driver";
  const extrasGbp = Math.max(0, summary.outstandingExtraChargesGbp ?? 0);
  const overallGbp = overallTerminationPositionGbp(summary);
  return (
    <section className="rph-card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-rph-fg">When the contract ended</h2>
        <p className="rph-muted mt-1 text-xs">
          Saved when the contract was ended.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-rph-fg-muted">Rent due for contract</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">
            {formatGbp(summary.accruedRentDueGbp)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-rph-fg-muted">Rent paid</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">
            {formatGbp(summary.accruedRentPaidGbp)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-rph-fg-muted">Rent paid in advance</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">
            {formatGbp(summary.prepaidRentCreditGbp)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-rph-fg-muted">Deposit</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">{formatGbp(summary.depositGbp)}</dd>
        </div>
        {extrasGbp > 0.005 ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-rph-fg-muted">Extra charges outstanding</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">{formatGbp(extrasGbp)}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs text-rph-fg-muted">Money owed at end</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rph-fg">
            {settlementBalanceLabel(
              summary.balanceDirection,
              Math.abs(overallGbp),
              audience,
            )}
          </dd>
          {extrasGbp > 0.005 ? (
            <dd className="mt-0.5 text-xs text-rph-fg-muted">
              Includes {formatGbp(extrasGbp)} outstanding extra charges
            </dd>
          ) : null}
        </div>
        {depositDispositionLabel ? (
          <div>
            <dt className="text-xs text-rph-fg-muted">
              {isDriver ? "What happened to your deposit" : "What we did with deposit"}
            </dt>
            <dd className="mt-0.5 text-rph-fg">{depositDispositionLabel}</dd>
          </div>
        ) : null}
        {settlementResolutionLabel ? (
          <div>
            <dt className="text-xs text-rph-fg-muted">
              {isDriver ? "How the balance was settled" : "How balance was cleared"}
            </dt>
            <dd className="mt-0.5 text-rph-fg">{settlementResolutionLabel}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
