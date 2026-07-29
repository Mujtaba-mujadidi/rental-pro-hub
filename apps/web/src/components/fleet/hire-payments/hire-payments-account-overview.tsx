"use client";

import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import type { HireSettlementLedgerSummary } from "@/lib/fleet/hire-payments-ledger";
import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { formatGbp } from "@/lib/fleet/maintenance";

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "action" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : tone === "action"
        ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "bg-rph-chrome text-rph-fg-secondary";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-rph-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-rph-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function HirePaymentsAccountOverview({
  contractEnded,
  contractEndedAtLabel,
  summary,
  terminationSummary,
  settlementBalance,
  depositPendingReview,
  depositGbp,
  depositDispositionLabel,
  ledgerSummary,
}: {
  contractEnded: boolean;
  contractEndedAtLabel?: string | null;
  summary: HirePaymentSummary;
  terminationSummary?: HireTerminationAccountsSummary | null;
  settlementBalance?: HireWorkspaceSettlementBalance | null;
  depositPendingReview?: boolean;
  depositGbp?: number;
  depositDispositionLabel?: string | null;
  ledgerSummary?: HireSettlementLedgerSummary | null;
}) {
  if (!contractEnded) {
    return (
      <section className="rph-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Rent account</p>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          Totals below are for rent weeks that have already started (up to today). Deposit is shown
          separately on the schedule.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Metric label="Rent due (to date)" value={formatGbp(summary.totalDueGbp)} />
          <Metric label="Paid on rent" value={formatGbp(summary.totalPaidGbp)} />
          <Metric
            label={summary.balanceGbp > 0 ? "Outstanding rent" : "Rent credit"}
            value={formatGbp(summary.balanceGbp > 0 ? summary.balanceGbp : summary.creditGbp)}
          />
        </div>
      </section>
    );
  }

  const rentDueGbp = terminationSummary?.accruedRentDueGbp ?? summary.totalDueGbp;
  const rentPaidGbp = terminationSummary?.accruedRentPaidGbp ?? summary.totalPaidGbp;
  const rentOutstandingGbp = Math.max(0, summary.balanceGbp);
  const rentCreditGbp = Math.max(0, summary.creditGbp);
  const settlementSettled = settlementBalance?.settled === true;
  const needsAction = !settlementSettled || depositPendingReview;

  return (
    <section
      className={`rph-card space-y-4 p-4 ${needsAction ? "border-amber-500/40" : "border-rph-border-strong"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">
            Hire account summary
          </p>
          {contractEndedAtLabel ? (
            <p className="mt-1 text-sm text-rph-fg">
              Contract ended <span className="font-medium">{contractEndedAtLabel}</span>
            </p>
          ) : null}
        </div>
        <StatusPill
          label={needsAction ? "Action required" : "Accounts closed"}
          tone={needsAction ? "action" : "ok"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusPill
          label={
            settlementSettled
              ? "Final balance cleared"
              : settlementBalance
                ? settlementBalanceLabel(
                    settlementBalance.settlementDirection,
                    settlementBalance.openBalanceGbp,
                  )
                : "Final balance"
          }
          tone={settlementSettled ? "ok" : "action"}
        />
        {depositPendingReview ? (
          <StatusPill label={`Deposit held ${formatGbp(depositGbp ?? 0)}`} tone="action" />
        ) : depositDispositionLabel ? (
          <StatusPill label={`Deposit: ${depositDispositionLabel}`} tone="neutral" />
        ) : null}
      </div>

      <div className="grid gap-4 border-t border-rph-border/80 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Rent due for contract"
          value={formatGbp(rentDueGbp)}
          hint="Rent for the time the driver had the car"
        />
        <Metric
          label="Paid on rent schedule"
          value={formatGbp(rentPaidGbp)}
          hint={
            rentOutstandingGbp > 0
              ? `${formatGbp(rentOutstandingGbp)} still shown as due until deposit is applied to rent`
              : rentCreditGbp > 0
                ? `${formatGbp(rentCreditGbp)} paid in advance`
                : "Rent for this contract is fully paid"
          }
        />
        {terminationSummary ? (
          <Metric
            label="Money owed at end"
            value={settlementBalanceLabel(
              terminationSummary.balanceDirection,
              Math.abs(terminationSummary.netSettlementGbp),
            )}
            hint="Recorded when the contract was ended"
          />
        ) : null}
        {ledgerSummary ? (
          <Metric
            label="Net cash (this hire)"
            value={formatGbp(ledgerSummary.netCashGbp)}
            hint={`In ${formatGbp(ledgerSummary.totalReceivedGbp)} · Out ${formatGbp(ledgerSummary.totalPaidGbp)}`}
          />
        ) : null}
      </div>

      <p className="text-xs text-rph-fg-muted">
        Each hire contract has its own balances. Rent on the schedule, payments after contract end,
        and deposit are kept separate — they do not mix across contracts.
      </p>
    </section>
  );
}
