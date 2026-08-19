"use client";

import { useMemo, useState } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { activeBalanceStatementCalculation } from "@/lib/fleet/hire-active-balance-display";
import {
  formatHireSettlementLedgerDate,
  formatHireSettlementSignedAmount,
  hireStatementLedgerRowsForDisplay,
} from "@/lib/fleet/hire-settlement-balance-display";
import type { HireSettlementLedgerRow, HireSettlementStatement } from "@/lib/fleet/hire-settlement-statement";
import { formatGbp } from "@/lib/fleet/maintenance";

type StatementTab = "all" | "charges" | "payments";

const STATEMENT_TAB_LABELS: Record<StatementTab, string> = {
  all: "All activity",
  charges: "Charges",
  payments: "Payments",
};

export function HireBalanceAccountStatementPanel({
  hireGroupId,
  statement,
  rentChargedAfterDiscountGbp,
  extraChargesGbp,
  currentBalanceGbp,
  payments,
  canRecordPayment,
  canAddCharge,
  pending,
  onReload,
  onAddCharge,
}: {
  hireGroupId: string;
  statement: HireSettlementStatement;
  rentChargedAfterDiscountGbp: number;
  extraChargesGbp: number;
  currentBalanceGbp: number;
  payments: HirePaymentsPageData;
  canRecordPayment: boolean;
  canAddCharge: boolean;
  pending: boolean;
  onReload: () => void;
  onAddCharge: () => void;
}) {
  const [statementTab, setStatementTab] = useState<StatementTab>("all");
  const statementRows = hireStatementLedgerRowsForDisplay(statement.rows, statementTab);
  const calculation = useMemo(
    () =>
      activeBalanceStatementCalculation({
        rentChargedAfterDiscountGbp,
        extraChargesGbp,
        paymentsReceivedGbp: statement.kpis.approvedPaymentsGbp,
        currentBalanceGbp,
      }),
    [
      currentBalanceGbp,
      extraChargesGbp,
      rentChargedAfterDiscountGbp,
      statement.kpis.approvedPaymentsGbp,
    ],
  );

  return (
    <div className="hire-balance-statement">
      <section className="hire-balance-statement-ledger">
        <header className="hire-balance-statement-ledger-header">
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="driver-dash-section-label">Account statement</p>
              <h2 className="hire-balance-statement-title">Charges & payments</h2>
              <p className="hire-balance-statement-help">
                <span className="lg:hidden">Positive amounts increase the balance, payments and credits reduce it.</span>
                <span className="hidden lg:inline">
                  Balance is what the driver owed after each line, in date order. Charges add to it;
                  payments and credits take it down.
                </span>
              </p>
            </div>
            {canRecordPayment || canAddCharge ? (
              <div className="hire-balance-statement-ledger-actions">
                {canAddCharge ? (
                  <button type="button" className="rph-btn-ghost h-9 px-3 text-sm" onClick={onAddCharge}>
                    Add charge
                  </button>
                ) : null}
                {canRecordPayment ? (
                  <HireAllocatedPaymentComposer
                    hireGroupId={hireGroupId}
                    payments={payments}
                    submitLabel="Record payment"
                    triggerLabel="Record payment"
                    onSuccess={onReload}
                    busy={pending}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <nav className="hire-balance-statement-filters" aria-label="Statement filters">
            {(["all", "charges", "payments"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={
                  statementTab === value
                    ? "hire-balance-statement-filter hire-balance-statement-filter-active"
                    : "hire-balance-statement-filter"
                }
                onClick={() => setStatementTab(value)}
              >
                {STATEMENT_TAB_LABELS[value]}
              </button>
            ))}
          </nav>
        </header>
        <div className="hire-balance-statement-table-wrap">
          <table className="hire-balance-statement-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Activity</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="hire-balance-statement-empty">
                    No posted items yet.
                  </td>
                </tr>
              ) : (
                statementRows.map((row) => <StatementRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="hire-balance-statement-side">
        <div className="hire-balance-statement-calc">
          <p className="driver-dash-section-label">Current position</p>
          <h2 className="hire-balance-statement-title">Balance calculation</h2>
          <dl className="hire-balance-statement-calc-list">
            {calculation.rows.map((row) => (
              <div
                key={row.label}
                className={
                  row.strong
                    ? "hire-balance-statement-calc-row hire-balance-statement-calc-row-strong"
                    : "hire-balance-statement-calc-row"
                }
              >
                <dt>{row.label}</dt>
                <dd className={row.strong ? "tabular-nums font-semibold text-rph-fg" : "tabular-nums"}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="hire-balance-statement-calc-note">{calculation.footnote}</p>
        </div>
      </aside>
    </div>
  );
}

function StatementRow({ row }: { row: HireSettlementLedgerRow }) {
  const credit = row.signedAmountGbp < -0.005;
  return (
    <tr className="hire-balance-statement-row">
      <td className="hire-balance-statement-date">{formatHireSettlementLedgerDate(row)}</td>
      <td className="hire-balance-statement-activity">
        <p className="font-semibold text-rph-fg">{row.activityTitle}</p>
        {row.activityDetail ? <p className="mt-0.5 text-xs text-rph-fg-secondary">{row.activityDetail}</p> : null}
      </td>
      <td className="hire-balance-statement-kind">
        <span
          className={
            row.status === "approved"
              ? "hire-balance-statement-type hire-balance-statement-type-approved"
              : "hire-balance-statement-type hire-balance-statement-type-posted"
          }
        >
          {row.status === "approved" ? "Approved" : "Posted"}
        </span>
        <p className="hire-balance-statement-kind-label">{row.kind === "payment" ? "Payment" : "Charge"}</p>
      </td>
      <td
        className={`hire-balance-statement-amount font-semibold tabular-nums ${
          credit ? "text-emerald-700 dark:text-emerald-300" : "text-rph-fg"
        }`}
      >
        {formatHireSettlementSignedAmount(row.signedAmountGbp)}
      </td>
      <td className="hire-balance-statement-balance font-semibold tabular-nums text-rph-fg">
        {formatGbp(row.runningBalanceGbp)}
      </td>
    </tr>
  );
}
