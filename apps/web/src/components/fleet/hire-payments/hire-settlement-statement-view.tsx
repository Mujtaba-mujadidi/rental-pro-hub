"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  countHireEndedPendingReviews,
  resolveHireEndedBalanceCase,
} from "@/lib/fleet/hire-ended-balance-case";
import {
  buildHireEndedDepositRefundDisplay,
  buildHireEndedRentCalculation,
} from "@/lib/fleet/hire-ended-payments-display";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";
import {
  buildHireEndedOutstandingBalance,
  sumDriverChargesGbp,
} from "@/lib/fleet/hire-ended-summary-display";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
} from "@/lib/fleet/hire-payments-ledger";
import { formatGbp } from "@/lib/fleet/maintenance";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function HireSettlementStatementView({
  hireGroupId,
  data,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
}) {
  const ledger = useMemo(
    () => summarizeHireSettlementLedger(data.settlementBalancePayments),
    [data.settlementBalancePayments],
  );
  const outstanding = buildHireEndedOutstandingBalance(data, {
    refundPaidGbp: ledger.settlementPaidGbp,
  });
  const balanceCase = resolveHireEndedBalanceCase({
    settled: outstanding.settled,
    openBalanceGbp: outstanding.amountGbp,
    pendingReviews: data.pendingReviews,
  });
  const rent = buildHireEndedRentCalculation(data);
  const depositRefund = buildHireEndedDepositRefundDisplay({ payments: data });
  const chargedGbp = sumDriverChargesGbp(data.driverChargeLineItems) + rent.rentDueToEndGbp;
  const paidGbp = data.summary.totalPaidGbp + ledger.totalReceivedGbp;
  const refundPayments = data.settlementBalancePayments.filter(
    (payment) => payment.direction === "paid_to_driver",
  );
  const refundMarkByRowId = useMemo(
    () =>
      buildHireScheduleRefundMarksByRowId(data.rows, data.contractEndedYmd, {
        prepaidRentRefundedGbp: depositRefund?.advanceRentRefundedGbp ?? 0,
        depositRefundedGbp: depositRefund?.depositRefundedGbp ?? 0,
      }),
    [data.contractEndedYmd, data.rows, depositRefund?.advanceRentRefundedGbp, depositRefund?.depositRefundedGbp],
  );
  const pendingCount = countHireEndedPendingReviews(data.pendingReviews);

  return (
    <div className="hire-balance-workspace mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/rental/balances" className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
            ← Back to balances
          </Link>
          <div className="flex flex-wrap gap-2">
            <HirePaymentStatementDownloadButton
              hireGroupId={hireGroupId}
              variant="default"
              source="hire-payments"
            />
            <Link href={`/rental/hires/${hireGroupId}`} className="rph-btn-ghost">
              View hire
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hire-balance-page-badge">
            {balanceCase === "settled" ? "Settled" : "Ended hire"}
          </span>
          {pendingCount > 0 ? (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              {pendingCount} pending review{pendingCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="font-mono text-xs text-rph-fg-muted">{data.vehicleVrm}</span>
        </div>
        <h1 className="hire-balance-page-title">Signed-off settlement statement</h1>
        <p className="hire-balance-page-line">
          {data.driverLabel ? `${data.driverLabel} · ` : null}
          {data.contractEndedAtLabel ?? "Contract ended"}
        </p>
      </header>

      {balanceCase === "settled" ? (
        <section className="hire-ws-settled-banner">
          <div className="hire-ws-settled-banner-main">
            <span className="hire-ws-settled-banner-icon" aria-hidden>
              ✓
            </span>
            <div>
              <p className="hire-ws-settled-banner-kicker">Settlement complete</p>
              <h2 className="hire-ws-settled-banner-title">Account signed off</h2>
              <p className="mt-1 text-sm text-rph-fg-secondary">
                Final hire balance is {formatGbp(0)}. Download the PDF for your records.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rph-alert-warn text-sm">
          This hire is not fully settled yet. The statement reflects the current confirmed position
          ({formatGbp(outstanding.amountGbp)} open).
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="hire-balance-panel">
          <p className="hire-balance-panel-kicker">Charged</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-rph-fg">{formatGbp(chargedGbp)}</p>
          <p className="hire-balance-kpi-hint mt-1">Rent to end date + posted charges</p>
        </section>
        <section className="hire-balance-panel">
          <p className="hire-balance-panel-kicker">Paid</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-rph-fg">{formatGbp(paidGbp)}</p>
          <p className="hire-balance-kpi-hint mt-1">Rent receipts + settlement received</p>
        </section>
      </div>

      <section className="hire-balance-panel space-y-3">
        <h2 className="hire-balance-panel-title">Deposit outcome</h2>
        {depositRefund ? (
          <dl className="hire-balance-ledger">
            {depositRefund.originalDepositGbp > 0.005 ? (
              <div className="hire-balance-ledger-row">
                <dt className="hire-balance-ledger-label">Original deposit</dt>
                <dd className="hire-balance-ledger-value">
                  {formatGbp(depositRefund.originalDepositGbp)}
                </dd>
              </div>
            ) : null}
            <div className="hire-balance-ledger-row">
              <dt className="hire-balance-ledger-label">Less unpaid rent</dt>
              <dd className="hire-balance-ledger-value">
                −{formatGbp(depositRefund.lessUnpaidRentGbp)}
              </dd>
            </div>
            <div className="hire-balance-ledger-row">
              <dt className="hire-balance-ledger-label">Less damage charge</dt>
              <dd className="hire-balance-ledger-value">−{formatGbp(depositRefund.lessDamageGbp)}</dd>
            </div>
            <div className="hire-balance-ledger-row">
              <dt className="hire-balance-ledger-label">{depositRefund.refundPaidLabel}</dt>
              <dd className="hire-balance-ledger-value">
                {formatGbp(depositRefund.refundPaidToDriverGbp)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-rph-fg-secondary">No deposit was held on this hire.</p>
        )}
        {data.depositDispositionLabel ? (
          <p className="text-xs text-rph-fg-muted">{data.depositDispositionLabel}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="hire-balance-panel-title">Refund audit</h2>
        <div className="rph-table-responsive overflow-hidden rounded-xl border border-rph-border">
          <table className="hire-ws-payments-table hire-ws-payments-table-no-actions min-w-full">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Transaction</th>
                <th scope="col">Method</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {refundPayments.map((payment) => (
                <tr key={payment.id}>
                  <td data-label="Date">{formatUkDateTime(payment.paidAt)}</td>
                  <td data-label="Transaction">
                    {hireLedgerPaymentTypeLabel({
                      direction: payment.direction,
                      paymentCategory: payment.paymentCategory,
                      notes: payment.notes,
                      audience: "staff",
                    })}
                  </td>
                  <td data-label="Method">
                    {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                  </td>
                  <td data-label="Amount" className="tabular-nums font-medium">
                    {formatGbp(payment.amountGbp)}
                  </td>
                </tr>
              ))}
              {refundPayments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-rph-fg-secondary">
                    No refunds paid to the driver.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="hire-balance-panel-title">Rent schedule</h2>
        <HirePaymentScheduleTable
          rows={data.rows}
          canRecordOnRow={false}
          canApprove={false}
          canApplyDiscount={false}
          contractEndedYmd={data.contractEndedYmd}
          settlementSettled={data.settlementBalance?.settled === true}
          refundMarkByRowId={refundMarkByRowId}
          audience="staff"
          readOnly
          showActions={false}
          variant="workspace"
          onRefresh={() => undefined}
        />
      </section>
    </div>
  );
}
