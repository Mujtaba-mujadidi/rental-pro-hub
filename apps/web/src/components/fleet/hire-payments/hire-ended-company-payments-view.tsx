"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { exportHirePaymentStatementAction } from "@/app/actions/hire-payments";
import { resolveHirePendingReturnChargeAction } from "@/app/actions/hire-return-charges";
import { HireDepositDispositionResolveCard } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HireSettlementBalancePaymentCard } from "@/components/fleet/hire-payments/hire-settlement-balance-payment-card";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  buildHireEndedBalanceLifecycle,
  countHireEndedPendingReviews,
  hireEndedConfirmedPositionLabel,
  resolveHireEndedBalanceCase,
  type HireEndedBalanceLifecycleStep,
  type HireEndedPendingChargeReview,
} from "@/lib/fleet/hire-ended-balance-case";
import {
  buildHireEndedConfirmedCalculation,
  buildHireEndedDepositPositionDisplay,
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
import { formatHireEndHireSignedAmount } from "@/lib/fleet/hire-end-hire-financial";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";

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

const dropdownContentClass =
  "z-[200] min-w-[13rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";
const dropdownItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

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
  const [showPaymentComposer, setShowPaymentComposer] = useState(false);
  const [statementPending, startStatementTransition] = useTransition();
  const [statementError, setStatementError] = useState<string | null>(null);

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
  const depositPosition = useMemo(
    () => buildHireEndedDepositPositionDisplay(data, confirmedCalc),
    [confirmedCalc, data],
  );
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
  const firstPendingCharge = data.pendingReviews.charges.find(
    (charge) => charge.proposedGbp != null && charge.proposedGbp > 0.005,
  );
  const canRecordPayment =
    data.canRecordSettlementPayment && data.settlementBalance != null && !data.settlementBalance.settled;
  const reviewsLocked = data.reviewsLockedUntilEndHireFinalized;
  const endHireHref = `/rental/hires/${hireGroupId}/end-hire`;

  const tabs = useMemo(() => {
    const items: Array<{ id: EndedBalanceTab; label: string }> = [
      { id: "overview", label: "Overview" },
      { id: "rent-schedule", label: "Rent schedule" },
      { id: "charges", label: "Charges" },
      { id: "account-statement", label: "Account statement" },
    ];
    if (pendingReviewCount > 0) {
      items.push({ id: "reviews", label: `Reviews (${pendingReviewCount})` });
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
    setShowPaymentComposer(true);
    setTab("overview");
    window.setTimeout(() => {
      paymentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const downloadStatement = () => {
    setStatementError(null);
    startStatementTransition(() => {
      void (async () => {
        const res = await exportHirePaymentStatementAction(hireGroupId);
        if (!res.ok) {
          setStatementError(res.error);
          return;
        }
        const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = res.fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      })();
    });
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

      <LifecycleStepper steps={lifecycle} />

      {reviewsLocked ? (
        <section className="rph-alert-warn flex flex-wrap items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold">Finish End hire before Reviews</p>
            <p className="mt-0.5 text-xs opacity-90">
              Deposit disposition and pending return-charge decisions stay on End hire until
              finalisation is complete. Payments remain available for the confirmed balance.
            </p>
          </div>
          <Link href={endHireHref} className="rph-btn-primary h-9 shrink-0 px-3 text-sm">
            Continue End hire
          </Link>
        </section>
      ) : null}

      {balanceCase !== "settled" ? (
        <section className="hire-balance-hero">
          <div className="hire-balance-hero-inner">
            <div className="min-w-0">
              <span className="hire-balance-hero-badge">Confirmed position</span>
              <p className="hire-balance-hero-label">{confirmedLabel}</p>
              {balanceCase === "pending_review" && pendingBannerLine ? (
                <p className="hire-balance-hero-breakdown">{pendingBannerLine}</p>
              ) : outstanding.detail ? (
                <p className="hire-balance-hero-breakdown">{outstanding.detail}</p>
              ) : null}
              {statementError ? (
                <p className="mt-1 text-xs text-red-200">{statementError}</p>
              ) : null}
            </div>
            <div className="shrink-0">
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className="hire-balance-hero-cta" disabled={statementPending}>
                    Actions
                    <span aria-hidden>▾</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    collisionPadding={12}
                    className={dropdownContentClass}
                  >
                    {canRecordPayment ? (
                      <DropdownMenu.Item
                        className={dropdownItemClass}
                        onSelect={() => goRecordPayment()}
                      >
                        Record payment
                      </DropdownMenu.Item>
                    ) : null}
                    {balanceCase === "pending_review" ? (
                      reviewsLocked ? (
                        <DropdownMenu.Item className={dropdownItemClass} asChild>
                          <Link href={endHireHref}>Continue End hire</Link>
                        </DropdownMenu.Item>
                      ) : (
                        <DropdownMenu.Item
                          className={dropdownItemClass}
                          onSelect={() => goReviews()}
                        >
                          {firstPendingCharge
                            ? `Review ${formatGbp(firstPendingCharge.proposedGbp ?? 0)} charge`
                            : "Review pending items"}
                        </DropdownMenu.Item>
                      )
                    ) : null}
                    <DropdownMenu.Item
                      className={dropdownItemClass}
                      disabled={statementPending}
                      onSelect={() => downloadStatement()}
                    >
                      {statementPending ? "Preparing…" : "Download statement"}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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
              depositPosition={depositPosition}
              depositRefund={depositRefund}
              settledKpis={settledKpis}
              paymentCardRef={paymentCardRef}
              showPaymentComposer={showPaymentComposer}
              reviewsLocked={reviewsLocked}
              endHireHref={endHireHref}
              onReload={onReload}
              onGoReviews={goReviews}
              onGoRecordPayment={goRecordPayment}
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
              reviewsLocked={reviewsLocked}
              endHireHref={endHireHref}
              onGoReviews={goReviews}
            />
          ) : null}

          {tab === "account-statement" ? (
            <AccountStatementTab hireGroupId={hireGroupId} data={data} />
          ) : null}

          {tab === "reviews" && pendingReviewCount > 0 ? (
            <ReviewsTab
              hireGroupId={hireGroupId}
              data={data}
              reviewsLocked={reviewsLocked}
              endHireHref={endHireHref}
              onReload={onReload}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LifecycleStepper({ steps }: { steps: HireEndedBalanceLifecycleStep[] }) {
  const trackState = (status: HireEndedBalanceLifecycleStep["status"]) =>
    status === "done" ? "done" : status === "active" ? "current" : "upcoming";

  return (
    <section className="hire-ended-lifecycle" aria-label="Settlement lifecycle">
      <ol className="hire-ws-track-mobile mt-0">
        {steps.map((step, index) => {
          const state = trackState(step.status);
          return (
            <li key={step.id} className="hire-ws-track-step">
              <div className="hire-ws-track-marker">
                <div className="hire-ws-track-node">
                  <LifecycleTrackCircle state={state} index={index} />
                </div>
                {index < steps.length - 1 ? (
                  <span className="hire-ws-track-v-line" aria-hidden />
                ) : null}
              </div>
              <div className="hire-ws-track-text-mobile">
                <p className="hire-ws-track-label">{step.label}</p>
                <p className="hire-ws-track-detail">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="hire-ws-track-horizontal mt-0" aria-label="Settlement lifecycle">
        {steps.map((step, index) => {
          const state = trackState(step.status);
          return (
            <li key={step.id} className="hire-ws-track-h-step">
              <div className="hire-ws-track-h-node">
                <LifecycleTrackCircle state={state} index={index} />
              </div>
              <div className="hire-ws-track-h-segment">
                <p className="hire-ws-track-label hire-ws-track-h-label">{step.label}</p>
                <p className="hire-ws-track-detail hire-ws-track-h-detail">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LifecycleTrackCircle({
  state,
  index,
}: {
  state: "done" | "current" | "upcoming";
  index: number;
}) {
  return (
    <span
      className={`hire-ws-track-ring ${
        state === "done"
          ? "hire-ws-track-ring-done"
          : state === "current"
            ? "hire-ws-track-ring-current"
            : "hire-ws-track-ring-upcoming"
      }`}
    >
      <span
        className={`hire-ws-track-dot ${
          state === "done"
            ? "hire-ws-track-dot-done"
            : state === "current"
              ? "hire-ws-track-dot-current"
              : "hire-ws-track-dot-upcoming"
        }`}
      >
        {state === "done" ? (
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          index + 1
        )}
      </span>
    </span>
  );
}

function OverviewTab({
  hireGroupId,
  data,
  balanceCase,
  confirmedCalc,
  depositPosition,
  depositRefund,
  settledKpis,
  paymentCardRef,
  showPaymentComposer,
  reviewsLocked,
  endHireHref,
  onReload,
  onGoReviews,
  onGoRecordPayment,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  balanceCase: ReturnType<typeof resolveHireEndedBalanceCase>;
  confirmedCalc: ReturnType<typeof buildHireEndedConfirmedCalculation>;
  depositPosition: ReturnType<typeof buildHireEndedDepositPositionDisplay>;
  depositRefund: ReturnType<typeof buildHireEndedDepositRefundDisplay>;
  settledKpis: ReturnType<typeof buildHireEndedSettledKpis>;
  paymentCardRef: RefObject<HTMLDivElement | null>;
  showPaymentComposer: boolean;
  reviewsLocked: boolean;
  endHireHref: string;
  onReload: () => void;
  onGoReviews: (focus?: "deposit" | "charge") => void;
  onGoRecordPayment: () => void;
}) {
  const firstPendingCharge = data.pendingReviews.charges.find(
    (charge) => charge.proposedGbp != null && charge.proposedGbp > 0.005,
  );
  const pendingReviewCount = countHireEndedPendingReviews(data.pendingReviews);
  const pendingReviewHeadline =
    pendingReviewCount === 1 && firstPendingCharge
      ? `Review the ${formatGbp(firstPendingCharge.proposedGbp ?? 0)} charge before final settlement`
      : "Review pending decisions before final settlement";

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
        <section className="hire-balance-panel p-4 sm:p-5">
          <p className="hire-balance-panel-kicker">Confirmed calculation</p>
          <h2 className="hire-balance-panel-title">Charges, payments and held funds</h2>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
              Confirmed final charges
            </p>
            <div className="mt-1.5">
              {confirmedCalc.chargeRows.map((row) => (
                <CalcRow key={row.id} label={row.label} value={row.value} />
              ))}
              <CalcRow
                label="Total confirmed charges"
                value={confirmedCalc.totalConfirmedChargesLabel}
                emphasis
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
              Confirmed settlement funding
            </p>
            <div className="mt-1.5">
              {confirmedCalc.fundingRows.map((row) => (
                <CalcRow key={row.id} label={row.label} value={row.value} />
              ))}
              <CalcRow
                label="Funding applied"
                value={formatGbp(confirmedCalc.fundingAppliedGbp)}
                emphasis
              />
            </div>
          </div>

          <div className="mt-4 border-t border-rph-border pt-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-rph-fg">Confirmed balance now</span>
              <span className="text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                {confirmedCalc.confirmedBalanceHeadline}
              </span>
            </div>
            {confirmedCalc.pendingReviewNote ? (
              <p className="rph-alert-warn mt-2 text-xs leading-relaxed">
                {confirmedCalc.pendingReviewNote}
              </p>
            ) : null}
          </div>
        </section>

        <section className="hire-balance-panel p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="hire-balance-panel-kicker">Deposit position</p>
              <h2 className="hire-balance-panel-title">
                {depositPosition.heldForReview ? "Deposit remains held" : "Deposit on this hire"}
              </h2>
            </div>
            {depositPosition.heldForReview ? (
              <span className="rph-pill border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                Held
              </span>
            ) : null}
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <MoneyRow label="Required by contract" value={formatGbp(depositPosition.requiredGbp)} />
            <MoneyRow label="Actually received" value={formatGbp(depositPosition.receivedGbp)} />
            {depositPosition.unreceivedGbp > 0.005 ? (
              <MoneyRow
                label="Unreceived · not final debt"
                value={formatGbp(depositPosition.unreceivedGbp)}
              />
            ) : null}
            <MoneyRow
              label="Confirmed balance before deposit"
              value={formatGbp(depositPosition.confirmedBeforeDepositGbp)}
            />
            {depositPosition.projectedIfApprovedGbp != null ? (
              <MoneyRow
                label="Projected if charge approved"
                value={formatGbp(depositPosition.projectedIfApprovedGbp)}
              />
            ) : null}
            {depositPosition.heldSeparatelyGbp > 0.005 ? (
              <MoneyRow
                label="Deposit held separately"
                value={formatGbp(depositPosition.heldSeparatelyGbp)}
              />
            ) : null}
          </dl>

          {depositPosition.stillOwesGbp > 0.005 ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25">
              <span className="text-sm font-semibold text-rph-fg">Driver still owes</span>
              <span className="text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                {depositPosition.stillOwesLabel}
              </span>
            </div>
          ) : (
            <div className="rph-alert-ok mt-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Confirmed balance</span>
              <span className="text-sm font-semibold tabular-nums">{depositPosition.stillOwesLabel}</span>
            </div>
          )}

          {depositPosition.heldForReview ? (
            <>
              <div className="rph-alert-warn mt-3 text-sm">
                <p className="font-semibold">Deposit held for review</p>
                <p className="mt-0.5 text-xs opacity-90">
                  Evidence under review · no allocation or refund posted.
                </p>
              </div>
              {reviewsLocked ? (
                <Link
                  href={endHireHref}
                  className="mt-3 inline-block text-sm font-medium text-rph-link hover:text-rph-link-hover"
                >
                  Continue End hire to resolve deposit
                </Link>
              ) : (
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-rph-link hover:text-rph-link-hover"
                  onClick={() => onGoReviews("deposit")}
                >
                  Review deposit decision
                </button>
              )}
            </>
          ) : depositRefund ? (
            <dl className="hire-balance-ledger mt-4">
              <MoneyRow label="Less unpaid rent" value={`−${formatGbp(depositRefund.lessUnpaidRentGbp)}`} />
              <MoneyRow label="Less damage charge" value={`−${formatGbp(depositRefund.lessDamageGbp)}`} />
              <MoneyRow
                label={depositRefund.refundPaidLabel}
                value={formatGbp(depositRefund.refundPaidToDriverGbp)}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-rph-fg-secondary">No deposit was held on this hire.</p>
          )}
        </section>
      </div>

      {showPaymentComposer &&
      data.canRecordSettlementPayment &&
      data.settlementBalance &&
      !data.settlementBalance.settled ? (
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

      <section className="hire-ended-next-steps">
        <div className="hire-ended-next-steps-copy">
          <p className="hire-ended-next-steps-kicker">What happens next</p>
          {balanceCase === "pending_review" ? (
            <>
              <p className="hire-ended-next-steps-title">
                {reviewsLocked
                  ? "Complete End hire before reviewing pending items"
                  : pendingReviewHeadline}
              </p>
              <p className="hire-ended-next-steps-desc">
                {reviewsLocked
                  ? "Return-charge and deposit decisions are made on End hire. Finish finalisation, then return here if further settlement is needed."
                  : "The charge does not affect the confirmed balance until approved. Holding the deposit is recommended while evidence is reviewed."}
              </p>
            </>
          ) : (
            <>
              <p className="hire-ended-next-steps-title">
                Record payment to clear the confirmed balance
              </p>
              <p className="hire-ended-next-steps-desc">
                No reviews are pending. Record a settlement payment or refund to close this account.
              </p>
            </>
          )}
        </div>
        <div className="hire-ended-next-steps-actions">
          <div className="hire-ended-next-steps-actions-row">
            {balanceCase === "pending_review" ? (
              reviewsLocked ? (
                <Link href={endHireHref} className="rph-btn-primary h-10 px-4">
                  Continue End hire
                </Link>
              ) : (
                <button type="button" className="rph-btn-primary h-10 px-4" onClick={() => onGoReviews()}>
                  Review charge
                </button>
              )
            ) : (
              <button type="button" className="rph-btn-primary h-10 px-4" onClick={onGoRecordPayment}>
                Record payment
              </button>
            )}
            <Link href={`/rental/hires/${hireGroupId}/payments`} className="rph-btn-ghost h-10 px-4">
              Add adjustment
            </Link>
          </div>
          <Link
            href={`/rental/balances/${hireGroupId}`}
            className="hire-ended-next-steps-reminder"
          >
            Send balance reminder
          </Link>
        </div>
      </section>
    </div>
  );
}

function CalcRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-1.5 ${
        emphasis ? "mt-1 border-t border-dashed border-rph-border pt-2 font-semibold text-rph-fg" : ""
      }`}
    >
      <span className={emphasis ? "text-sm" : "text-sm text-rph-fg-secondary"}>{label}</span>
      <span className="shrink-0 text-sm tabular-nums">{value}</span>
    </div>
  );
}

function ChargesTab({
  hireGroupId,
  data,
  reviewsLocked,
  endHireHref,
  onGoReviews,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  reviewsLocked: boolean;
  endHireHref: string;
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

      <div className="rph-table-responsive">
        <table className="hire-ended-simple-table">
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">Status</th>
              <th scope="col">Amount</th>
              <th scope="col" className="hire-ended-simple-table-actions">
                Actions
              </th>
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
                <td data-label="Actions" className="hire-ended-simple-table-actions">
                  {reviewsLocked ? (
                    <Link href={endHireHref} className="rph-btn-ghost">
                      End hire
                    </Link>
                  ) : (
                    <button type="button" className="rph-btn-ghost" onClick={onGoReviews}>
                      Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.unpostedReturnCharges.map((item) => (
              <tr key={item.id}>
                <td data-label="Charge">
                  <p className="font-medium text-rph-fg">{item.label}</p>
                </td>
                <td data-label="Status">
                  <span className="rph-pill">On balance</span>
                </td>
                <td data-label="Amount" className="tabular-nums font-medium">
                  {formatGbp(item.amountGbp)}
                </td>
                <td data-label="Actions" className="hire-ended-simple-table-actions">
                  —
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
                  <td data-label="Actions" className="hire-ended-simple-table-actions">
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
            {pending.length === 0 && posted.length === 0 && data.unpostedReturnCharges.length === 0 ? (
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

      <div className="rph-table-responsive">
        <table className="hire-ended-simple-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Transaction</th>
              <th scope="col">Method</th>
              <th scope="col" className="hire-ended-simple-table-actions">
                Amount
              </th>
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
                <td data-label="Amount" className="hire-ended-simple-table-actions tabular-nums font-medium">
                  {formatGbp(payment.amountGbp)}
                </td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-rph-fg-secondary sm:px-5">
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
  reviewsLocked,
  endHireHref,
  onReload,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  reviewsLocked: boolean;
  endHireHref: string;
  onReload: () => void;
}) {
  const confirmed = useMemo(() => buildHireEndedConfirmedCalculation(data), [data]);
  const depositHeldGbp = roundGbp(
    Math.max(0, data.pendingReviews.depositHeldGbp || data.depositReceivedGbp || 0),
  );
  const charges = data.pendingReviews.charges;
  const canResolveDepositHere =
    !reviewsLocked && data.depositPendingReview && data.canResolveDeposit && data.terminationSummary;

  return (
    <div className="space-y-4">
      <header>
        <p className="hire-balance-panel-kicker">Decisions needed</p>
        <h2 className="hire-balance-panel-title">Reviews</h2>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          {reviewsLocked
            ? "These decisions are locked until End hire is finalised."
            : "Approve, waive or adjust amounts for return charges. Resolve the deposit disposition when held."}
        </p>
      </header>

      {reviewsLocked ? (
        <section className="rph-alert-warn flex flex-wrap items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold">Complete End hire first</p>
            <p className="mt-0.5 text-xs opacity-90">
              Resolve the deposit and any pending return charges on the End hire final account, then
              finalise the contract.
            </p>
          </div>
          <Link href={endHireHref} className="rph-btn-primary h-9 shrink-0 px-3 text-sm">
            Continue End hire
          </Link>
        </section>
      ) : null}

      {canResolveDepositHere ? (
        <div id="hire-ended-deposit-resolve">
          <HireDepositDispositionResolveCard
            hireGroupId={hireGroupId}
            terminationSummary={data.terminationSummary!}
            depositHeldGbp={data.depositReceivedGbp}
            currentSignedSettlementGbp={data.currentSignedSettlementGbp}
            onSuccess={onReload}
          />
        </div>
      ) : data.depositPendingReview ? (
        <section className="rph-alert-warn text-sm">
          Deposit {formatGbp(data.pendingReviews.depositHeldGbp || data.depositReceivedGbp)} is held
          pending review.
          {reviewsLocked
            ? " Finish End hire to resolve the disposition."
            : " You need permission to resolve deposit disposition."}
        </section>
      ) : null}

      {charges.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-rph-fg-secondary">
            Confirmed balance {formatGbp(confirmed.confirmedBalanceGbp)}
            {data.depositPendingReview && depositHeldGbp > 0.005
              ? ` · Deposit ${formatGbp(depositHeldGbp)} held`
              : ""}
          </p>
          <div className="rph-table-responsive">
            <table className="hire-ended-simple-table">
              <thead>
                <tr>
                  <th scope="col">Charge</th>
                  <th scope="col">Proposed</th>
                  <th scope="col">If approved</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="hire-ended-simple-table-actions">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {charges.map((review) => (
                  <PendingChargeReviewRow
                    key={review.id}
                    hireGroupId={hireGroupId}
                    review={review}
                    confirmedBalanceGbp={confirmed.confirmedBalanceGbp}
                    actionsDisabled={reviewsLocked}
                    onSuccess={onReload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !data.depositPendingReview ? (
        <p className="rounded-xl border border-rph-border bg-rph-page/60 px-4 py-6 text-sm text-rph-fg-secondary">
          No return charges are awaiting review.
        </p>
      ) : null}
    </div>
  );
}

function PendingChargeReviewRow({
  hireGroupId,
  review,
  confirmedBalanceGbp,
  actionsDisabled,
  onSuccess,
}: {
  hireGroupId: string;
  review: HireEndedPendingChargeReview;
  confirmedBalanceGbp: number;
  actionsDisabled: boolean;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    review.proposedGbp != null && review.proposedGbp > 0 ? review.proposedGbp.toFixed(2) : "",
  );

  const proposedGbp =
    review.proposedGbp != null && review.proposedGbp > 0.005 ? review.proposedGbp : null;
  const projectedGbp =
    proposedGbp != null ? roundGbp(confirmedBalanceGbp + proposedGbp) : null;

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
        setEditing(false);
        onSuccess();
      })();
    });
  }

  return (
    <tr>
      <td data-label="Charge">
        <p className="font-medium text-rph-fg">{review.label}</p>
        {review.detail ? <p className="text-xs text-rph-fg-secondary">{review.detail}</p> : null}
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
        {editing ? (
          <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-rph-fg-muted">Amount (£)</span>
            <input
              className="rph-input w-28 py-1 text-sm"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
            />
          </label>
        ) : null}
      </td>
      <td data-label="Proposed" className="tabular-nums font-medium">
        {proposedGbp != null ? formatHireEndHireSignedAmount(proposedGbp, true) : "—"}
      </td>
      <td data-label="If approved" className="tabular-nums">
        {projectedGbp != null ? formatGbp(projectedGbp) : "—"}
      </td>
      <td data-label="Status">
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Awaiting review
        </span>
      </td>
      <td data-label="Actions" className="hire-ended-simple-table-actions">
        {actionsDisabled ? (
          <span className="text-xs text-rph-fg-muted">Locked</span>
        ) : editing ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              className="rph-btn-ghost h-8 px-2 text-xs"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rph-btn-primary h-8 px-2 text-xs"
              disabled={pending}
              onClick={() => run("approve", Number(amount))}
            >
              Approve
            </button>
          </div>
        ) : (
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="hire-ws-payments-row-action-trigger inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50"
                disabled={pending}
                aria-label={`Actions for ${review.label}`}
                title="Actions"
              >
                <span aria-hidden className="text-base leading-none">
                  ⋮
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className={dropdownContentClass}
              >
                <DropdownMenu.Item
                  className={dropdownItemClass}
                  disabled={pending || proposedGbp == null}
                  onSelect={() => run("approve", proposedGbp ?? undefined)}
                >
                  {proposedGbp != null ? `Approve ${formatGbp(proposedGbp)}` : "Approve"}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={dropdownItemClass}
                  disabled={pending}
                  onSelect={() => setEditing(true)}
                >
                  Edit and approve…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={dropdownItemClass}
                  disabled={pending}
                  onSelect={() => run("waive")}
                >
                  Reject charge
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </td>
    </tr>
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
