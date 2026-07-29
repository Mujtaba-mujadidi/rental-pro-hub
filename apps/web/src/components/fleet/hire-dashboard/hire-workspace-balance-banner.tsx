"use client";

import {
  hireDepositStatusLabel,
  hireRentSettlementStatusLabel,
  type HireFinancialClosureState,
} from "@/lib/fleet/hire-financial-closure";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";

function BalanceAmount({
  amountGbp,
  label,
  tone = "default",
}: {
  amountGbp: number;
  label: string;
  tone?: "default" | "muted" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "muted"
        ? "text-rph-fg-secondary"
        : "text-rph-fg";

  return (
    <div>
      <p className="text-xs text-rph-fg-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{formatGbp(amountGbp)}</p>
    </div>
  );
}

export function HireWorkspaceBalanceBanner({
  hireGroupId,
  rentBalanceGbp,
  rentCreditGbp = 0,
  settlementBalance,
  audience = "staff",
  contractEnded = false,
  depositPendingReview = false,
  depositGbp = 0,
  depositDispositionLabel = null,
  scheduleDepositStatusLabel = "Not required",
}: {
  hireGroupId: string;
  rentBalanceGbp: number;
  rentCreditGbp?: number;
  settlementBalance: HireWorkspaceSettlementBalance | null;
  audience?: "staff" | "driver";
  contractEnded?: boolean;
  depositPendingReview?: boolean;
  depositGbp?: number;
  depositDispositionLabel?: string | null;
  scheduleDepositStatusLabel?: string;
}) {
  const hasRentDue = rentBalanceGbp > 0.005;
  const hasRentCredit = rentCreditGbp > 0.005;
  const showRentBalance = !contractEnded || settlementBalance == null;
  const hasOpenSettlement =
    settlementBalance != null && !settlementBalance.settled && settlementBalance.openBalanceGbp > 0.005;
  const rentSettlementSettled = settlementBalance?.settled === true;
  const showDepositColumn = contractEnded && (depositPendingReview || Boolean(depositDispositionLabel));
  const financiallyClosed = rentSettlementSettled && !depositPendingReview;

  const rentLabel =
    audience === "driver"
      ? hasRentDue
        ? "You owe (rent)"
        : hasRentCredit
          ? "Rent credit owed to you"
          : "Rent balance"
      : hasRentDue
        ? "Driver owes (rent)"
        : hasRentCredit
          ? "Rent credit owed to driver"
          : "Rent balance";

  const settlementLabel =
    audience === "driver"
      ? settlementBalance?.settlementDirection === "driver_owes_company"
        ? "You owe (final balance)"
        : "Money owed to you"
      : settlementBalance
        ? settlementBalanceLabel(
            settlementBalance.settlementDirection,
            settlementBalance.openBalanceGbp,
          )
        : "Final balance";

  const closure: Pick<HireFinancialClosureState, "rentSettlementSettled" | "depositPendingReview" | "depositGbp"> =
    {
      rentSettlementSettled,
      depositPendingReview,
      depositGbp,
    };

  const columnCount = [showRentBalance, settlementBalance != null, showDepositColumn].filter(Boolean).length;

  return (
    <section
      className={`rph-card p-4 ${
        depositPendingReview ? "border-amber-500/40" : "border-rph-border-strong"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Balances</p>
        {contractEnded ? (
          <p
            className={`text-xs font-medium ${
              financiallyClosed ? "text-rph-fg-secondary" : "text-amber-700 dark:text-amber-300"
            }`}
          >
            {financiallyClosed ? "Hire accounts closed" : "Accounts open — action may still be required"}
          </p>
        ) : null}
      </div>

      <div
        className={`mt-3 grid gap-4 ${
          columnCount >= 3 ? "sm:grid-cols-3" : columnCount === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"
        }`}
      >
        {showRentBalance ? (
          <div>
            {hasRentDue ? (
              <BalanceAmount amountGbp={rentBalanceGbp} label={rentLabel} />
            ) : hasRentCredit ? (
              <BalanceAmount amountGbp={rentCreditGbp} label={rentLabel} />
            ) : (
              <div>
                <p className="text-xs text-rph-fg-muted">{rentLabel}</p>
                <p className="mt-1 text-sm font-medium text-rph-fg-secondary">No rent balance outstanding</p>
              </div>
            )}
          </div>
        ) : null}

        {settlementBalance ? (
          <div>
            {hasOpenSettlement ? (
              <BalanceAmount amountGbp={settlementBalance.openBalanceGbp} label={settlementLabel} />
            ) : (
              <div>
                <p className="text-xs text-rph-fg-muted">Final balance</p>
                <p className="mt-1 text-sm font-medium text-rph-fg-secondary">
                  {hireRentSettlementStatusLabel(closure, audience)}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {showDepositColumn ? (
          <div>
            {depositPendingReview ? (
              <BalanceAmount amountGbp={depositGbp} label="Deposit held" tone="warning" />
            ) : (
              <div>
                <p className="text-xs text-rph-fg-muted">Deposit</p>
                <p className="mt-1 text-sm font-medium text-rph-fg-secondary">
                  {hireDepositStatusLabel({
                    depositPendingReview,
                    depositGbp,
                    depositDispositionLabel,
                    scheduleDepositPaidLabel: scheduleDepositStatusLabel,
                  })}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {audience === "staff" && hasOpenSettlement ? (
        <p className="rph-muted mt-4 text-xs">
          Record payments on the Payments tab, or open the{" "}
          <Link href={`/rental/balances/${hireGroupId}`} className="rph-link-inline">
            balance workspace
          </Link>{" "}
          for notes and payment history.
        </p>
      ) : null}

      {audience === "staff" && depositPendingReview && rentSettlementSettled ? (
        <p className="rph-muted mt-4 text-xs">
          Final balance is cleared.{" "}
          <Link href={`/rental/hires/${hireGroupId}/payments`} className="rph-link-inline">
            Decide what to do with the held deposit on Payments
          </Link>{" "}
          to close this hire.
        </p>
      ) : null}
    </section>
  );
}
