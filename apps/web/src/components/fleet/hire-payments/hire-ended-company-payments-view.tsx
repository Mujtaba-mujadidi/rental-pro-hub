"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { resolveHirePendingReturnChargeAction } from "@/app/actions/hire-return-charges";
import { HireDepositDispositionResolveCard } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HireSettlementBalancePaymentCard } from "@/components/fleet/hire-payments/hire-settlement-balance-payment-card";
import { HireSettlementFinalizationBanner } from "@/components/fleet/hire-payments/hire-settlement-finalization-banner";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  buildHireEndedBalanceLifecycle,
  countHireEndedPendingReviews,
  hireEndedConfirmedPositionLabel,
  resolveHireEndedBalanceCase,
  type HireEndedPendingChargeReview,
} from "@/lib/fleet/hire-ended-balance-case";
import {
  buildHireEndedConfirmedCalculation,
  buildHireEndedSettledKpis,
  hireEndedPendingReviewBannerLine,
} from "@/lib/fleet/hire-ended-balance-overview";
import {
  buildHireEndedDepositRefundDisplay,
  buildHireEndedRentCalculation,
  formatEndedChargeCardDisplay,
  formatEndedChargeEvidenceHref,
} from "@/lib/fleet/hire-ended-payments-display";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";
import { buildHireEndedOutstandingBalance } from "@/lib/fleet/hire-ended-summary-display";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
} from "@/lib/fleet/hire-payments-ledger";
import { formatGbp } from "@/lib/fleet/maintenance";

type EndedBalanceTab =
  | "overview"
  | "rent-schedule"
  | "charges"
  | "account-statement"
  | "reviews";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

type HireEndedCompanyPaymentsViewProps = {
  hireGroupId: string;
  data: HirePaymentsPageData;
  onReload: () => void;
  hideIntro?: boolean;
};

export function HireEndedCompanyPaymentsView({
  hireGroupId,
  data,
  onReload,
  hideIntro = false,
}: HireEndedCompanyPaymentsViewProps) {
  const paymentCardRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<EndedBalanceTab>("overview");

  const ledger = useMemo(
    () => summarizeHireSettlementLedger(data.settlementBalancePayments),
    [data.settlementBalancePayments],
  );
  const outstanding = buildHireEndedOutstandingBalance(data, {
    refundPaidGbp: ledger.settlementPaidGbp,
  });
  const pendingReviewCount = countHireEndedPendingReviews(data.pendingReviews);
  const balanceCase = resolveHireEndedBalanceCase({
    settled: outstanding.settled,
    openBalanceGbp: outstanding.amountGbp,
    pendingReviews: data.pendingReviews,
  });
  const lifecycle = buildHireEndedBalanceLifecycle({
    balanceCase,
    openBalanceGbp: outstanding.amountGbp,
    pendingReviewCount,
  });
  const confirmedLabel = hireEndedConfirmedPositionLabel({
    direction: data.settlementBalance?.settlementDirection ?? (outstanding.settled ? "settled" : null),
    amountGbp: outstanding.amountGbp,
  });
  const pendingBannerLine = hireEndedPendingReviewBannerLine({
    pendingReviews: data.pendingReviews,
    openBalanceGbp: outstanding.amountGbp,
  });
  const confirmedCalc = useMemo(() => buildHireEndedConfirmedCalculation(data), [data]);
  const depositRefund = buildHireEndedDepositRefundDisplay({ payments: data });
  const settledKpis = useMemo(() => buildHireEndedSettledKpis(data), [data]);
  const refundMarkByRowId = useMemo(
    () =>
      buildHireScheduleRefundMarksByRowId(data.rows, data.contractEndedYmd, {
        prepaidRentRefundedGbp: depositRefund?.advanceRentRefundedGbp ?? 0,
        depositRefundedGbp: depositRefund?.depositRefundedGbp ?? 0,
      }),
    [data.contractEndedYmd, data.rows, depositRefund?.advanceRentRefundedGbp, depositRefund?.depositRefundedGbp],
  );

  const tabs = useMemo(() => {
    const items: Array<{ id: EndedBalanceTab; label: string }> = [
      { id: "overview", label: "Overview" },
      { id: "rent-schedule", label: "Rent schedule" },
      { id: "charges", label: "Charges" },
      { id: "account-statement", label: "Account statement" },
    ];
    if (pendingReviewCount > 0) {
      items.push({ id: "reviews", label: `Reviews(${pendingReviewCount})` });
    }
    return items;
  }, [pendingReviewCount]);

  useEffect(() => {
    if (pendingReviewCount <= 0 && tab === "reviews") {
      setTab("overview");
    }
  }, [pendingReviewCount, tab]);

  const goReviews = (focus?: "deposit" | "charge") => {
    setTab("reviews");
    if (focus === "deposit") {
      window.setTimeout(() => {
        document.getElementById("hire-ended-deposit-resolve")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  };

  const goRecordPayment = () => {
    setTab("overview");
    window.setTimeout(() => {
      paymentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <div className="hire-balance-workspace">
      {hideIntro ? null : (
        <header className="hire-balance-page-header">
          <p className="hire-balance-page-badge">Ended hire</p>
          <h1 className="hire-balance-page-title">Payments & balance</h1>
          <p className="hire-balance-page-desc">
            Final account for {data.vehicleVrm}
            {data.driverLabel ? ` · ${data.driverLabel}` : ""}.
          </p>
        </header>
      )}

      <ol className="hire-ended-lifecycle" aria-label="Settlement lifecycle">
        {lifecycle.map((step) => (
          <li
            key={step.id}
            className={
              step.status === "done"
                ? "hire-ended-lifecycle-step hire-ended-lifecycle-step-done"
                : step.status === "active"
                  ? "hire-ended-lifecycle-step hire-ended-lifecycle-step-active"
                  : "hire-ended-lifecycle-step"
            }
          >
            <span className="hire-ended-lifecycle-label">{step.label}</span>
            <span className="hire-ended-lifecycle-detail">{step.detail}</span>
          </li>
        ))}
      </ol>

      <HireSettlementFinalizationBanner
        hireGroupId={hireGroupId}
        contractEnded
        checkinCompleted={data.checkinCompleted}
      />

      {balanceCase !== "settled" ? (
        <section className="hire-balance-hero">
          <div className="hire-balance-hero-inner">
            <div className="min-w-0">
              <span className="hire-balance-hero-badge">Confirmed position</span>
              <p className="hire-balance-hero-label">{confirmedLabel}</p>
              <p className="hire-balance-hero-amount">{formatGbp(outstanding.amountGbp)}</p>
              {balanceCase === "pending_review" && pendingBannerLine ? (
                <p className="hire-balance-hero-breakdown">{pendingBannerLine}</p>
              ) : outstanding.detail ? (
                <p className="hire-balance-hero-breakdown">{outstanding.detail}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {balanceCase === "pending_review" ? (
                <button type="button" className="hire-balance-hero-cta" onClick={() => goReviews()}>
                  Review now
                </button>
              ) : data.canRecordSettlementPayment && data.settlementBalance && !data.settlementBalance.settled ? (
                <button type="button" className="hire-balance-hero-cta" onClick={goRecordPayment}>
                  Record payment
                </button>
              ) : null}
              <HirePaymentStatementDownloadButton hireGroupId={hireGroupId} variant="banner" />
            </div>
          </div>
        </section>
      ) : null}

      <section className="hire-balance-shell">
        <nav className="hire-balance-tabs" aria-label="Ended balance sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "hire-balance-tab hire-balance-tab-active" : "hire-balance-tab"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hire-balance-shell-body">
          {tab === "overview" ? (
            <OverviewTab
              hireGroupId={hireGroupId}
              data={data}
              balanceCase={balanceCase}
              confirmedCalc={confirmedCalc}
              depositRefund={depositRefund}
              settledKpis={settledKpis}
              paymentCardRef={paymentCardRef}
              onReload={onReload}
              onGoReviews={goReviews}
              onGoRecordPayment={goRecordPayment}
              onGoCharges={() => setTab("charges")}
            />
          ) : null}

          {tab === "rent-schedule" ? (
            <div className="space-y-3">
              <header>
                <p className="hire-balance-panel-kicker">Finalised rent</p>
                <h2 className="hire-balance-panel-title">Rent schedule</h2>
                <p className="mt-1 text-sm text-rph-fg-secondary">
                  Rent stopped at contract end. Prepaid periods the company paid back are marked Refunded.
                </p>
              </header>
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
                showActions
                variant="workspace"
                onRefresh={onReload}
              />
            </div>
          ) : null}

          {tab === "charges" ? (
            <ChargesTab
              hireGroupId={hireGroupId}
              data={data}
              onGoReviews={goReviews}
            />
          ) : null}

          {tab === "account-statement" ? (
            <AccountStatementTab hireGroupId={hireGroupId} data={data} />
          ) : null}

          {tab === "reviews" && pendingReviewCount > 0 ? (
            <ReviewsTab hireGroupId={hireGroupId} data={data} onReload={onReload} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function OverviewTab({
  hireGroupId,
  data,
  balanceCase,
  confirmedCalc,
  depositRefund,
  settledKpis,
  paymentCardRef,
  onReload,
  onGoReviews,
  onGoRecordPayment,
  onGoCharges,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  balanceCase: ReturnType<typeof resolveHireEndedBalanceCase>;
  confirmedCalc: ReturnType<typeof buildHireEndedConfirmedCalculation>;
  depositRefund: ReturnType<typeof buildHireEndedDepositRefundDisplay>;
  settledKpis: ReturnType<typeof buildHireEndedSettledKpis>;
  paymentCardRef: RefObject<HTMLDivElement | null>;
  onReload: () => void;
  onGoReviews: (focus?: "deposit" | "charge") => void;
  onGoRecordPayment: () => void;
  onGoCharges: () => void;
}) {
  if (balanceCase === "settled") {
    return (
      <div className="hire-balance-overview space-y-4">
        <section className="hire-ws-settled-banner">
          <div className="hire-ws-settled-banner-main">
            <span className="hire-ws-settled-banner-icon" aria-hidden>
              ✓
            </span>
            <div>
              <p className="hire-ws-settled-banner-kicker">Settlement complete</p>
              <h2 className="hire-ws-settled-banner-title">Fully settled</h2>
              <p className="mt-1 text-sm text-rph-fg-secondary">Final hire balance is £0.00.</p>
            </div>
          </div>
          <div className="hire-ws-settled-banner-balance">
            <p className="text-xs text-rph-fg-secondary">Final hire balance</p>
            <p className="text-3xl font-semibold tabular-nums text-rph-fg">{formatGbp(0)}</p>
            <span className="hire-ws-settled-banner-badge">Closed account</span>
          </div>
        </section>

        <div className="hire-balance-kpi-grid">
          <Kpi label="Final charges" value={formatGbp(settledKpis.finalChargesGbp)} hint="Rent + posted charges" />
          <Kpi label="Received" value={formatGbp(settledKpis.receivedGbp)} hint="Rent and settlement in" />
          <Kpi label="Deposit used" value={formatGbp(settledKpis.depositUsedGbp)} hint="Applied to unpaid rent" />
          <Kpi label="Refunded" value={formatGbp(settledKpis.refundedGbp)} hint="Paid to driver" />
        </div>

        <div className="hire-balance-detail-grid">
          <section className="hire-balance-panel">
            <p className="hire-balance-panel-kicker">Reconciliation</p>
            <h2 className="hire-balance-panel-title">Account closed</h2>
            <p className="mt-3 text-sm text-rph-fg-secondary">
              Confirmed charges and payments reconcile to a zero final balance.
            </p>
            <dl className="hire-balance-ledger mt-4">
              {confirmedCalc.rows.map((row) => (
                <div key={row.id} className="hire-balance-ledger-row">
                  <dt className="hire-balance-ledger-label">{row.label}</dt>
                  <dd className="hire-balance-ledger-value">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="hire-balance-panel">
            <p className="hire-balance-panel-kicker">Deposit outcome</p>
            <h2 className="hire-balance-panel-title">
              {data.depositDispositionLabel ?? "No deposit held"}
            </h2>
            {depositRefund ? (
              <dl className="hire-balance-ledger mt-4">
                {depositRefund.originalDepositGbp > 0.005 ? (
                  <MoneyRow label="Original deposit" value={formatGbp(depositRefund.originalDepositGbp)} />
                ) : null}
                <MoneyRow label="Refunded to driver" value={formatGbp(depositRefund.refundPaidToDriverGbp)} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-rph-fg-secondary">No deposit was held on this hire.</p>
            )}
          </section>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/rental/hires/${hireGroupId}/settlement-statement`}
            className="rph-btn-primary"
          >
            Open signed-off statement
          </Link>
          <HirePaymentStatementDownloadButton
            hireGroupId={hireGroupId}
            variant="default"
            source="hire-payments"
          />
        </div>
        <p className="rounded-xl border border-rph-border bg-rph-page/60 px-4 py-3 text-sm text-rph-fg-secondary">
          This hire account is closed. Use the signed-off statement for a permanent record of charges,
          payments and deposit outcome.
        </p>
      </div>
    );
  }

  return (
    <div className="hire-balance-overview space-y-4">
      <div className="hire-balance-detail-grid">
        <section className="hire-balance-panel">
          <div className="hire-balance-panel-head">
            <div>
              <p className="hire-balance-panel-kicker">Confirmed</p>
              <h2 className="hire-balance-panel-title">Confirmed calculation</h2>
            </div>
            <button type="button" className="hire-balance-panel-link" onClick={onGoCharges}>
              View charges
            </button>
          </div>
          <dl className="hire-balance-ledger mt-3">
            {confirmedCalc.rows.map((row) => (
              <div
                key={row.id}
                className={
                  row.tone === "pending"
                    ? "hire-balance-ledger-row rounded-lg bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30"
                    : "hire-balance-ledger-row"
                }
              >
                <dt className="hire-balance-ledger-label">{row.label}</dt>
                <dd
                  className={
                    row.tone === "emphasis"
                      ? "hire-balance-ledger-value font-semibold"
                      : "hire-balance-ledger-value"
                  }
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {confirmedCalc.projectedLine ? (
            <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">{confirmedCalc.projectedLine}</p>
          ) : null}
        </section>

        <section className="hire-balance-panel">
          <div className="hire-balance-panel-head">
            <div>
              <p className="hire-balance-panel-kicker">Deposit</p>
              <h2 className="hire-balance-panel-title">Deposit position</h2>
            </div>
            {data.depositPendingReview ? (
              <button
                type="button"
                className="hire-balance-panel-link"
                onClick={() => onGoReviews("deposit")}
              >
                Open Reviews
              </button>
            ) : null}
          </div>
          {data.depositPendingReview ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-rph-fg-secondary">Held pending disposition decision.</p>
              <p className="text-2xl font-semibold tabular-nums text-rph-fg">
                {formatGbp(data.pendingReviews.depositHeldGbp || data.depositReceivedGbp)}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200">Resolve deposit on the Reviews tab.</p>
            </div>
          ) : depositRefund ? (
            <dl className="hire-balance-ledger mt-4">
              {depositRefund.originalDepositGbp > 0.005 ? (
                <MoneyRow label="Original deposit" value={formatGbp(depositRefund.originalDepositGbp)} />
              ) : null}
              <MoneyRow label="Less unpaid rent" value={`−${formatGbp(depositRefund.lessUnpaidRentGbp)}`} />
              <MoneyRow label="Less damage charge" value={`−${formatGbp(depositRefund.lessDamageGbp)}`} />
              <MoneyRow label={depositRefund.refundPaidLabel} value={formatGbp(depositRefund.refundPaidToDriverGbp)} />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-rph-fg-secondary">No deposit was held on this hire.</p>
          )}
          {data.depositDispositionLabel ? (
            <p className="mt-3 text-xs text-rph-fg-muted">{data.depositDispositionLabel}</p>
          ) : null}
        </section>
      </div>

      {data.canRecordSettlementPayment && data.settlementBalance && !data.settlementBalance.settled ? (
        <div ref={paymentCardRef}>
          <HireSettlementBalancePaymentCard
            hireGroupId={hireGroupId}
            settlementBalance={data.settlementBalance}
            paymentAccounts={data.settlementPaymentAccounts}
            defaultPaymentAccountId={data.defaultSettlementPaymentAccountId}
            onSuccess={onReload}
          />
        </div>
      ) : null}

      <section className="hire-balance-panel">
        <p className="hire-balance-panel-kicker">Next</p>
        <h2 className="hire-balance-panel-title">What happens next</h2>
        {balanceCase === "pending_review" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-rph-fg-secondary">
              Resolve pending charge and deposit reviews before recording final settlement.
            </p>
            <button type="button" className="rph-btn-primary" onClick={() => onGoReviews()}>
              Go to Reviews
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-rph-fg-secondary">
              Record a settlement payment or refund to clear the confirmed open balance.
            </p>
            <button type="button" className="rph-btn-primary" onClick={onGoRecordPayment}>
              Record payment
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ChargesTab({
  hireGroupId,
  data,
  onGoReviews,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  onGoReviews: () => void;
}) {
  const posted = data.driverChargeLineItems.filter(
    (item) =>
      (item.resolution === "add_to_balance" ||
        item.resolution === "paid_now" ||
        item.resolution === "waived") &&
      (item.resolution === "waived" || item.amountGbp > 0.005),
  );
  const pending = data.pendingReviews.charges;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hire-balance-panel-kicker">Return & extras</p>
          <h2 className="hire-balance-panel-title">Charges</h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Posted, waived and pending review charges for this ended hire.
          </p>
        </div>
        {data.canMutateExtraCharges ? (
          <Link href={`/rental/hires/${hireGroupId}/payments`} className="rph-btn-ghost">
            Add adjustment
          </Link>
        ) : (
          <Link href={`/rental/hires/${hireGroupId}`} className="rph-btn-ghost">
            View hire
          </Link>
        )}
      </div>

      <div className="rph-table-responsive overflow-hidden rounded-xl border border-rph-border">
        <table className="hire-ws-payments-table hire-ws-payments-table-no-actions min-w-full">
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">Status</th>
              <th scope="col">Amount</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((review) => (
              <tr key={`pending-${review.id}`}>
                <td data-label="Charge">
                  <p className="font-medium text-rph-fg">{review.label}</p>
                  {review.detail ? <p className="text-xs text-rph-fg-secondary">{review.detail}</p> : null}
                </td>
                <td data-label="Status">
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                    Pending review
                  </span>
                </td>
                <td data-label="Amount" className="tabular-nums">
                  {review.proposedGbp != null && review.proposedGbp > 0.005
                    ? formatGbp(review.proposedGbp)
                    : "—"}
                </td>
                <td data-label="Actions">
                  <button type="button" className="rph-btn-ghost" onClick={onGoReviews}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {posted.map((item) => {
              const card = formatEndedChargeCardDisplay(item);
              const evidenceHref = formatEndedChargeEvidenceHref(hireGroupId, item);
              return (
                <tr key={item.id}>
                  <td data-label="Charge">
                    <p className="font-medium text-rph-fg">{card.title}</p>
                    <p className="text-xs text-rph-fg-secondary">
                      {item.chargeTypeLabel}
                      {item.createdAt ? ` · ${formatUkDateTime(item.createdAt)}` : ""}
                    </p>
                  </td>
                  <td data-label="Status">{item.resolutionLabel}</td>
                  <td data-label="Amount" className="tabular-nums font-medium">
                    {item.resolution === "waived" ? formatGbp(0) : formatGbp(item.amountGbp)}
                  </td>
                  <td data-label="Actions">
                    {evidenceHref ? (
                      <Link href={evidenceHref} className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
                        Evidence
                      </Link>
                    ) : (
                      <span className="text-xs text-rph-fg-muted">History</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pending.length === 0 && posted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-rph-fg-secondary">
                  No charges recorded on this hire.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountStatementTab({
  hireGroupId,
  data,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
}) {
  const rent = buildHireEndedRentCalculation(data);
  const payments = data.settlementBalancePayments;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hire-balance-panel-kicker">Ledger</p>
          <h2 className="hire-balance-panel-title">Account statement</h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Rent calculation and settlement payments after contract end.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HirePaymentStatementDownloadButton
            hireGroupId={hireGroupId}
            variant="default"
            source="hire-payments"
          />
          <Link
            href={`/rental/hires/${hireGroupId}/settlement-statement`}
            className="rph-btn-ghost"
          >
            Signed-off statement
          </Link>
        </div>
      </div>

      <section className="hire-balance-panel">
        <h3 className="text-sm font-semibold text-rph-fg">Rent calculation</h3>
        <dl className="hire-balance-ledger mt-3">
          <MoneyRow label="Rent due to end date" value={formatGbp(rent.rentDueToEndGbp)} />
          <MoneyRow label="Rent applied" value={`−${formatGbp(rent.paymentReceivedDuringHireGbp)}`} />
          <MoneyRow label="Paid from deposit" value={`−${formatGbp(rent.paidFromDepositGbp)}`} />
          <MoneyRow label="Rent outstanding" value={formatGbp(rent.rentOutstandingGbp)} />
        </dl>
      </section>

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
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td data-label="Date" className="whitespace-nowrap">
                  {formatUkDateTime(payment.paidAt)}
                </td>
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
            {payments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-rph-fg-secondary">
                  No settlement transactions recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewsTab({
  hireGroupId,
  data,
  onReload,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  onReload: () => void;
}) {
  return (
    <div className="space-y-4">
      <header>
        <p className="hire-balance-panel-kicker">Decisions needed</p>
        <h2 className="hire-balance-panel-title">Reviews</h2>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          Approve, waive or adjust amounts for return charges. Resolve the deposit disposition when held.
        </p>
      </header>

      {data.depositPendingReview && data.canResolveDeposit && data.terminationSummary ? (
        <div id="hire-ended-deposit-resolve">
          <HireDepositDispositionResolveCard
            hireGroupId={hireGroupId}
            terminationSummary={data.terminationSummary}
            depositHeldGbp={data.depositReceivedGbp}
            currentSignedSettlementGbp={data.currentSignedSettlementGbp}
            onSuccess={onReload}
          />
        </div>
      ) : data.depositPendingReview ? (
        <section className="rph-alert-warn text-sm">
          Deposit {formatGbp(data.pendingReviews.depositHeldGbp || data.depositReceivedGbp)} is held
          pending review. You need permission to resolve deposit disposition.
        </section>
      ) : null}

      {data.pendingReviews.charges.map((review) => (
        <PendingChargeReviewCard
          key={review.id}
          hireGroupId={hireGroupId}
          review={review}
          onSuccess={onReload}
        />
      ))}
    </div>
  );
}

function PendingChargeReviewCard({
  hireGroupId,
  review,
  onSuccess,
}: {
  hireGroupId: string;
  review: HireEndedPendingChargeReview;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    review.proposedGbp != null && review.proposedGbp > 0 ? review.proposedGbp.toFixed(2) : "",
  );

  function run(decision: "approve" | "waive", amountGbp?: number) {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await resolveHirePendingReturnChargeAction({
          hireGroupId,
          reviewId: review.id,
          decision,
          amountGbp,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSuccess();
      })();
    });
  }

  return (
    <section className="hire-balance-panel space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hire-balance-panel-kicker">{review.kind}</p>
          <h3 className="hire-balance-panel-title">{review.label}</h3>
          {review.detail ? <p className="mt-1 text-sm text-rph-fg-secondary">{review.detail}</p> : null}
        </div>
        <p className="text-lg font-semibold tabular-nums text-rph-fg">
          {review.proposedGbp != null && review.proposedGbp > 0.005
            ? formatGbp(review.proposedGbp)
            : "Amount needed"}
        </p>
      </div>

      {review.evidenceHref ? (
        <Link href={review.evidenceHref} className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
          View evidence
        </Link>
      ) : null}

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="rph-muted">Amount (£)</span>
            <input
              className="rph-input mt-1 w-36"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rph-btn-primary"
            disabled={pending}
            onClick={() => run("approve", Number(amount))}
          >
            Approve amount
          </button>
          <button type="button" className="rph-btn-ghost" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rph-btn-primary"
            disabled={pending || !(review.proposedGbp != null && review.proposedGbp > 0.005)}
            onClick={() => run("approve", review.proposedGbp ?? undefined)}
          >
            Approve
          </button>
          <button type="button" className="rph-btn-ghost" disabled={pending} onClick={() => run("waive")}>
            Reject (waive)
          </button>
          <button type="button" className="rph-btn-ghost" disabled={pending} onClick={() => setEditing(true)}>
            Edit amount
          </button>
        </div>
      )}
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="hire-balance-kpi">
      <p className="hire-balance-kpi-label">{label}</p>
      <p className="hire-balance-kpi-value">{value}</p>
      <p className="hire-balance-kpi-hint">{hint}</p>
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hire-balance-ledger-row">
      <dt className="hire-balance-ledger-label">{label}</dt>
      <dd className="hire-balance-ledger-value">{value}</dd>
    </div>
  );
}
