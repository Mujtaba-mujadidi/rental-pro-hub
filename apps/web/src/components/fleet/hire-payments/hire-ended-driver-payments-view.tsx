"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HireSettlementFinalizationBanner } from "@/components/fleet/hire-payments/hire-settlement-finalization-banner";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  buildHireEndedDepositRefundDisplay,
  buildHireEndedPositionSnapshot,
  buildHireEndedRentCalculation,
  formatEndedChargeCardDisplay,
  formatEndedChargeEvidenceHref,
} from "@/lib/fleet/hire-ended-payments-display";
import {
  buildHireEndedOutstandingBalance,
  hireEndedSettlementChipLabel,
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

type HireEndedDriverPaymentsViewProps = {
  hireGroupId: string;
  data: HirePaymentsPageData;
  onReload: () => void;
};

export function HireEndedDriverPaymentsView({
  hireGroupId,
  data,
  onReload,
}: HireEndedDriverPaymentsViewProps) {
  const [positionOpen, setPositionOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const ledger = useMemo(
    () => summarizeHireSettlementLedger(data.settlementBalancePayments),
    [data.settlementBalancePayments],
  );
  const outstanding = buildHireEndedOutstandingBalance(data, {
    refundPaidGbp: ledger.settlementPaidGbp,
    audience: "driver",
  });
  const rentCalc = buildHireEndedRentCalculation(data);
  const depositRefund = buildHireEndedDepositRefundDisplay({
    payments: data,
    audience: "driver",
  });
  const position = buildHireEndedPositionSnapshot(data);
  const settlementChip = hireEndedSettlementChipLabel(data);
  const charges = data.driverChargeLineItems.filter(
    (item) =>
      (item.resolution === "add_to_balance" || item.resolution === "paid_now") &&
      item.amountGbp > 0.005,
  );
  const settlementPayments = data.settlementBalancePayments;

  return (
    <div className="hire-ws-payments-layout space-y-4">
      <header className="hire-ws-payments-intro">
        <p className="hire-ws-section-kicker">Ended hire</p>
        <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Payments</h1>
      </header>

      {outstanding.settled ? (
        <section className="hire-ws-banner">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <span className="hire-ws-chip hire-ws-chip-success">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                {settlementChip ?? "Settlement completed"}
              </span>
              <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">{outstanding.headline}</h2>
              {outstanding.detail ? (
                <p className="mt-1 text-xs text-white/75 sm:text-sm">{outstanding.detail}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">
                {formatGbp(0)}
              </p>
              <HirePaymentStatementDownloadButton hireGroupId={hireGroupId} variant="banner" asDriver />
            </div>
          </div>
        </section>
      ) : (
        <section className="hire-ws-banner">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              {settlementChip ? (
                <span className="inline-flex rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                  {settlementChip}
                </span>
              ) : null}
              <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">{outstanding.headline}</h2>
              {outstanding.detail ? (
                <p className="mt-1 text-xs text-white/75 sm:text-sm">{outstanding.detail}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">
                {formatGbp(outstanding.amountGbp)}
              </p>
              <HirePaymentStatementDownloadButton hireGroupId={hireGroupId} variant="banner" asDriver />
            </div>
          </div>
        </section>
      )}

      <HireSettlementFinalizationBanner
        hireGroupId={hireGroupId}
        contractEnded
        checkinCompleted={data.checkinCompleted}
        audience="driver"
      />

      <HireDepositPendingBanner
        hireGroupId={hireGroupId}
        closure={{
          depositPendingReview: data.depositPendingReview,
          depositGbp: data.depositGbp ?? 0,
          rentSettlementSettled: data.settlementBalance?.settled === true,
        }}
        audience="driver"
        checkinCompleted={data.checkinCompleted}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="hire-ws-payments-account-card">
          <h2 className="text-sm font-semibold text-rph-fg">Rent calculation</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">Rent charged only to the end date.</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <MoneyRow label="Rent due to end date" value={formatGbp(rentCalc.rentDueToEndGbp)} />
            <MoneyRow
              label="You paid during hire"
              value={`-${formatGbp(rentCalc.paymentReceivedDuringHireGbp)}`}
            />
            <MoneyRow
              label="Paid from deposit"
              value={`-${formatGbp(rentCalc.paidFromDepositGbp)}`}
            />
          </dl>
          <div className="hire-ws-payments-account-footer">
            <span className="text-sm text-rph-fg-secondary">Rent outstanding</span>
            <span className="text-sm font-semibold tabular-nums text-rph-fg">
              {formatGbp(rentCalc.rentOutstandingGbp)}
            </span>
          </div>
          {rentCalc.cancelledPeriodNote ? (
            <p className="hire-ws-payments-next-note mt-3">{rentCalc.cancelledPeriodNote}</p>
          ) : null}
        </section>

        {depositRefund ? (
          <section className="hire-ws-payments-next-card">
            <h2 className="text-sm font-semibold text-rph-fg">Deposit and refund</h2>
            <p className="mt-0.5 text-xs text-rph-fg-secondary">
              How your {formatGbp(depositRefund.originalDepositGbp)} deposit was settled.
            </p>
            <dl className="mt-3 space-y-2.5 text-sm">
              <MoneyRow label="Original deposit" value={formatGbp(depositRefund.originalDepositGbp)} />
              <MoneyRow
                label="Less unpaid rent"
                value={`-${formatGbp(depositRefund.lessUnpaidRentGbp)}`}
              />
              <MoneyRow
                label="Less damage charge"
                value={`-${formatGbp(depositRefund.lessDamageGbp)}`}
              />
            </dl>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2.5 dark:border-sky-900/50 dark:bg-sky-950/25">
              <span className="text-sm text-rph-fg-secondary">{depositRefund.refundPaidLabel}</span>
              <span className="text-sm font-semibold tabular-nums text-rph-fg">
                {formatGbp(depositRefund.refundPaidToDriverGbp)}
              </span>
            </div>
            {depositRefund.refundNote ? (
              <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-xs leading-relaxed text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
                {depositRefund.refundNote}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="hire-ws-payments-next-card">
            <h2 className="text-sm font-semibold text-rph-fg">Deposit and refund</h2>
            <p className="mt-3 text-sm text-rph-fg-secondary">No deposit was held on this hire.</p>
          </section>
        )}
      </div>

      {charges.length > 0 ? (
        <section className="hire-ws-payments-panel">
          <header className="hire-ws-payments-panel-header">
            <h2 className="text-sm font-semibold text-rph-fg">Charges and evidence</h2>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
              Deductions taken from your refund after check-in.
            </p>
          </header>
          <div
            className={
              charges.length > 3
                ? "hire-ws-charges-body hire-ws-charges-body-scroll"
                : "hire-ws-charges-body"
            }
          >
            <ul className="hire-ws-charges-list">
              {charges.map((item) => {
                const evidenceHref = formatEndedChargeEvidenceHref(hireGroupId, item, "driver");
                const card = formatEndedChargeCardDisplay(item);
                const recordedMeta = item.createdAt
                  ? `Recorded at check-in on ${formatUkDateTime(item.createdAt)}`
                  : null;
                const meta =
                  card.severityLabel && recordedMeta
                    ? `${card.severityLabel} - ${recordedMeta}`
                    : recordedMeta ?? item.resolutionLabel;
                return (
                  <li key={item.id} className="hire-ws-charges-card">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="hire-ws-charges-type">{item.chargeTypeLabel}</span>
                        <p className="text-sm font-semibold text-rph-fg">{card.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-rph-fg-secondary">{meta}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4 sm:justify-end">
                      {evidenceHref ? (
                        <Link href={evidenceHref} className="hire-ws-charges-evidence-btn">
                          <EyeIcon />
                          View evidence
                        </Link>
                      ) : null}
                      <div className="text-left sm:min-w-[7rem] sm:text-right">
                        <p className="text-base font-semibold tabular-nums text-rph-fg">
                          {formatGbp(item.amountGbp)}
                        </p>
                        <p className="hire-ws-charges-resolution">{item.resolutionLabel}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {settlementPayments.length > 0 ? (
        <section className="hire-ws-payments-panel">
          <header className="hire-ws-payments-panel-header">
            <h2 className="text-sm font-semibold text-rph-fg">Settlement transactions</h2>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
              Payments made after your hire ended.
            </p>
          </header>

          <ul className="hire-ws-settlement-tx-list sm:hidden">
            {settlementPayments.map((payment) => {
              const isOut = payment.direction === "paid_to_driver";
              const label = hireLedgerPaymentTypeLabel({
                direction: payment.direction,
                paymentCategory: payment.paymentCategory,
                notes: payment.notes,
                audience: "driver",
              });
              return (
                <li key={payment.id} className="hire-ws-settlement-tx-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-rph-fg-secondary">{formatUkDateTime(payment.paidAt)}</p>
                      <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-rph-fg">
                        <span
                          className={
                            isOut
                              ? "hire-ws-settlement-tx-icon hire-ws-settlement-tx-icon-out"
                              : "hire-ws-settlement-tx-icon hire-ws-settlement-tx-icon-in"
                          }
                          aria-hidden
                        >
                          {isOut ? <ArrowOutIcon /> : <ArrowInIcon />}
                        </span>
                        <span className="min-w-0">{label}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-rph-fg-muted">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums text-rph-fg">
                      {formatGbp(payment.amountGbp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hire-ws-payments-table-wrap hidden sm:block">
            <table className="hire-ws-payments-table hire-ws-payments-table-no-actions">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">Method</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {settlementPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Date" className="whitespace-nowrap">
                      {formatUkDateTime(payment.paidAt)}
                    </td>
                    <td data-label="Transaction">
                      {hireLedgerPaymentTypeLabel({
                        direction: payment.direction,
                        paymentCategory: payment.paymentCategory,
                        notes: payment.notes,
                        audience: "driver",
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
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {position ? (
        <section className="hire-ws-payments-schedule-collapse">
          <button
            type="button"
            className="hire-ws-payments-schedule-toggle"
            aria-expanded={positionOpen}
            onClick={() => setPositionOpen((open) => !open)}
          >
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-rph-fg">
                Position when your hire ended
              </span>
              <span className="mt-0.5 block text-xs text-rph-fg-secondary">
                Historical snapshot before later charges and payments.
              </span>
            </span>
            <ChevronIcon open={positionOpen} />
          </button>
          {positionOpen ? (
            <div className="hire-ws-payments-schedule-body">
              <dl className="grid gap-3 sm:grid-cols-2">
                <SnapshotCell label="Rent due" value={formatGbp(position.rentDueGbp)} />
                <SnapshotCell
                  label="Rent paid by you"
                  value={formatGbp(position.rentPaidByDriverGbp)}
                />
                <SnapshotCell
                  label="Deposit applied to rent"
                  value={formatGbp(position.depositAppliedToRentGbp)}
                />
                <SnapshotCell
                  label="Refund due before later charges"
                  value={formatGbp(position.refundDueBeforeLaterChargesGbp)}
                />
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="hire-ws-payments-schedule-collapse">
        <button
          type="button"
          className="hire-ws-payments-schedule-toggle"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen((open) => !open)}
        >
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-rph-fg">Full rent schedule</span>
            <span className="mt-0.5 block text-xs text-rph-fg-secondary">
              Deposit and rent periods charged through the end date.
            </span>
          </span>
          <ChevronIcon open={scheduleOpen} />
        </button>
        {scheduleOpen ? (
          <div className="hire-ws-payments-schedule-body">
            <HirePaymentScheduleTable
              rows={data.rows}
              canRecordOnRow={false}
              canApprove={false}
              canApplyDiscount={false}
              contractEndedYmd={data.contractEndedYmd}
              settlementSettled={data.settlementBalance?.settled === true}
              audience="driver"
              readOnly
              showActions={false}
              variant="workspace"
              onRefresh={onReload}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-rph-fg-secondary">{label}</dt>
      <dd className="font-medium tabular-nums text-rph-fg">{value}</dd>
    </div>
  );
}

function SnapshotCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rph-border/70 bg-rph-page/50 px-3 py-2.5">
      <dt className="hire-ws-section-kicker">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-rph-fg">{value}</dd>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-rph-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowOutIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowInIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
