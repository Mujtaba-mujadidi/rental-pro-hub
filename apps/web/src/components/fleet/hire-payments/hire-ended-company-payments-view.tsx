"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { exportHirePaymentStatementAction } from "@/app/actions/hire-payments";
import { HireDepositDispositionResolveCard } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HirePendingReturnChargeReviewModal } from "@/components/fleet/hire-payments/hire-pending-return-charge-review-modal";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { HireSettlementPaymentComposer } from "@/components/fleet/hire-payments/hire-settlement-payment-composer";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
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
import {
  buildExtraChargePaymentTableRowsFromWorkspace,
  endedHireExtrasSettlementCapGbp,
  extraChargePaymentStatusClass,
  previewExtraChargePendingAllocation,
  type ExtraChargePaymentTableRow,
} from "@/lib/fleet/hire-driver-charge-payment";
import { staffManualChargeLockedAsHireTimePost } from "@/lib/fleet/hire-driver-charge-mutation";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";
import { buildHireEndedOutstandingBalance } from "@/lib/fleet/hire-ended-summary-display";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
} from "@/lib/fleet/hire-payments-ledger";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { HireAddChargeModal } from "@/components/fleet/hire-charges/hire-add-charge-modal";
import { HireChargeHistoryModal } from "@/components/fleet/hire-charges/hire-charge-history-modal";
import { HireVoidChargeModal } from "@/components/fleet/hire-charges/hire-void-charge-modal";
import { HireExtraChargeAmendPaymentModal } from "@/components/fleet/hire-charges/hire-extra-charge-amend-payment-modal";
import { HireExtraChargeRowActions } from "@/components/fleet/hire-charges/hire-extra-charge-row-actions";
import { HirePaymentReviewModal } from "@/components/fleet/hire-payments/hire-payment-review-modal";

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
  const [tab, setTab] = useState<EndedBalanceTab>("overview");
  const [settlementPaymentOpen, setSettlementPaymentOpen] = useState(false);
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
  const companyOwesDriver =
    data.settlementBalance?.settlementDirection === "company_owes_driver";
  const canRecordAllocatedPayment = canRecordPayment && !companyOwesDriver;
  const canRecordSettlementRefund = canRecordPayment && companyOwesDriver;
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
    setSettlementPaymentOpen(true);
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
                        {companyOwesDriver ? "Record refund" : "Record payment"}
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
              reviewsLocked={reviewsLocked}
              endHireHref={endHireHref}
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
              onReload={onReload}
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

      {canRecordAllocatedPayment ? (
        <HireAllocatedPaymentComposer
          hireGroupId={hireGroupId}
          payments={data}
          preferredAllocationKind={
            data.extraChargesOutstandingGbp > 0.005 ? "extra_charges" : "schedule"
          }
          submitLabel="Record payment"
          triggerLabel="Record payment"
          hideTrigger
          open={settlementPaymentOpen}
          onOpenChange={setSettlementPaymentOpen}
          onSuccess={onReload}
        />
      ) : null}

      {canRecordSettlementRefund && data.settlementBalance ? (
        <HireSettlementPaymentComposer
          hireGroupId={hireGroupId}
          settlementBalance={data.settlementBalance}
          paymentAccounts={data.settlementPaymentAccounts}
          defaultPaymentAccountId={data.defaultSettlementPaymentAccountId}
          hideTrigger
          open={settlementPaymentOpen}
          onOpenChange={setSettlementPaymentOpen}
          onSuccess={onReload}
        />
      ) : null}
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
  reviewsLocked,
  endHireHref,
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
  reviewsLocked: boolean;
  endHireHref: string;
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
          <Kpi label="Deposit used" value={formatGbp(settledKpis.depositUsedGbp)} hint="Applied to rent and charges" />
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
                {depositRefund.lessUnpaidRentGbp > 0.005 ? (
                  <MoneyRow
                    label="Applied to unpaid rent"
                    value={`−${formatGbp(depositRefund.lessUnpaidRentGbp)}`}
                  />
                ) : null}
                {depositRefund.lessDamageGbp > 0.005 ? (
                  <MoneyRow
                    label="Applied to charges"
                    value={`−${formatGbp(depositRefund.lessDamageGbp)}`}
                  />
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
                {depositPosition.heldForReview
                  ? "Deposit remains held"
                  : depositPosition.dispositionResolved
                    ? (data.depositDispositionLabel ?? "Deposit settled")
                    : "Deposit on this hire"}
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
            {depositPosition.heldForReview ? (
              <>
                <MoneyRow
                  label="Open balance (deposit not applied yet)"
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
              </>
            ) : (
              <>
                {depositPosition.appliedToRentGbp > 0.005 ? (
                  <MoneyRow
                    label="Applied to unpaid rent"
                    value={`−${formatGbp(depositPosition.appliedToRentGbp)}`}
                  />
                ) : null}
                {depositPosition.appliedToChargesGbp > 0.005 ? (
                  <MoneyRow
                    label="Applied to charges"
                    value={`−${formatGbp(depositPosition.appliedToChargesGbp)}`}
                  />
                ) : null}
                {depositPosition.refundedGbp > 0.005 ? (
                  <MoneyRow
                    label="Refunded to driver"
                    value={formatGbp(depositPosition.refundedGbp)}
                  />
                ) : null}
                {depositPosition.appliedTotalGbp <= 0.005 &&
                depositPosition.refundedGbp <= 0.005 &&
                depositRefund ? (
                  <>
                    {depositRefund.lessUnpaidRentGbp > 0.005 ? (
                      <MoneyRow
                        label="Applied to unpaid rent"
                        value={`−${formatGbp(depositRefund.lessUnpaidRentGbp)}`}
                      />
                    ) : null}
                    {depositRefund.lessDamageGbp > 0.005 ? (
                      <MoneyRow
                        label="Applied to charges"
                        value={`−${formatGbp(depositRefund.lessDamageGbp)}`}
                      />
                    ) : null}
                    <MoneyRow
                      label={depositRefund.refundPaidLabel}
                      value={formatGbp(depositRefund.refundPaidToDriverGbp)}
                    />
                  </>
                ) : null}
              </>
            )}
          </dl>

          {depositPosition.heldForReview ? (
            depositPosition.stillOwesGbp > 0.005 ? (
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
            )
          ) : (
            <div
              className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                depositPosition.stillOwesGbp > 0.005
                  ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/25"
                  : "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/25"
              }`}
            >
              <span className="text-sm font-semibold text-rph-fg">Open balance now</span>
              <span className="text-sm font-semibold tabular-nums">
                {depositPosition.stillOwesLabel}
              </span>
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
          ) : depositRefund?.refundNote ? (
            <p className="mt-3 text-xs leading-relaxed text-rph-fg-secondary">{depositRefund.refundNote}</p>
          ) : null}
        </section>
      </div>

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
                {data.settlementBalance?.settlementDirection === "company_owes_driver"
                  ? "Record refund"
                  : "Record payment"}
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
  onReload,
}: {
  hireGroupId: string;
  data: HirePaymentsPageData;
  onReload: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [voiding, setVoiding] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [history, setHistory] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [amending, setAmending] = useState<ExtraChargePaymentTableRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRow, setReviewRow] = useState<ExtraChargePaymentTableRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending_review" | "waived" | "open" | "paid"
  >("all");
  const [sortKey, setSortKey] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleColumnSort(nextKey: "date" | "amount") {
    if (sortKey === nextKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  }

  const posted = data.driverChargeLineItems.filter(
    (item) =>
      item.resolution === "add_to_balance" ||
      item.resolution === "paid_now" ||
      item.resolution === "waived",
  );
  const pending = data.pendingReviews.charges;
  const settlementOpenBalanceCapGbp = endedHireExtrasSettlementCapGbp({
    contractEnded: Boolean(data.contractEndedYmd),
    settlementDirection: data.settlementBalance?.settlementDirection,
    openBalanceGbp: data.settlementBalance?.openBalanceGbp,
  });
  const paymentRows = useMemo(
    () =>
      buildExtraChargePaymentTableRowsFromWorkspace({
        hireGroupId,
        items: data.driverChargeLineItems,
        outstandingGbp: data.extraChargesOutstandingGbp,
        pendingAmountGbp: data.extraChargePendingPayment?.amountGbp,
        allowMutate: data.canMutateExtraCharges,
        timedPayments: data.extraChargeTimedPayments,
        allocationEvents: data.extraChargeAllocationEvents,
        settleOrphanReceipts: Boolean(data.contractEndedYmd),
        settlementOpenBalanceCapGbp,
      }),
    [
      data.canMutateExtraCharges,
      data.contractEndedYmd,
      data.driverChargeLineItems,
      data.extraChargeAllocationEvents,
      data.extraChargePendingPayment?.amountGbp,
      data.extraChargeTimedPayments,
      data.extraChargesOutstandingGbp,
      hireGroupId,
      settlementOpenBalanceCapGbp,
    ],
  );
  const paymentStatusById = useMemo(
    () => new Map(paymentRows.map((row) => [row.id, row])),
    [paymentRows],
  );

  type ChargeTableRow =
    | {
        key: string;
        rowKind: "pending";
        sortAtMs: number;
        amountGbp: number;
        statusKey: "pending_review";
        searchText: string;
        review: (typeof pending)[number];
      }
    | {
        key: string;
        rowKind: "unposted";
        sortAtMs: number;
        amountGbp: number;
        statusKey: "open";
        searchText: string;
        item: (typeof data.unpostedReturnCharges)[number];
      }
    | {
        key: string;
        rowKind: "posted";
        sortAtMs: number;
        amountGbp: number;
        statusKey: "waived" | "open" | "paid";
        searchText: string;
        item: (typeof posted)[number];
      };

  const tableRows = useMemo(() => {
    const rows: ChargeTableRow[] = [];
    for (const review of pending) {
      rows.push({
        key: `pending-${review.id}`,
        rowKind: "pending",
        sortAtMs: Number.POSITIVE_INFINITY,
        amountGbp: review.proposedGbp ?? 0,
        statusKey: "pending_review",
        searchText: [review.label, review.detail, "pending review"]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        review,
      });
    }
    for (const item of data.unpostedReturnCharges) {
      rows.push({
        key: `unposted-${item.id}`,
        rowKind: "unposted",
        sortAtMs: 0,
        amountGbp: item.amountGbp,
        statusKey: "open",
        searchText: [item.label, "on balance"].join(" ").toLowerCase(),
        item,
      });
    }
    for (const item of posted) {
      const paymentRow = paymentStatusById.get(item.id);
      const statusKey: "waived" | "open" | "paid" =
        item.resolution === "waived"
          ? "waived"
          : item.resolution === "paid_now" ||
              paymentRow?.statusTone === "success" ||
              (paymentRow?.balanceGbp != null && paymentRow.balanceGbp <= 0.005)
            ? "paid"
            : "open";
      const sortSource = item.chargedOn?.trim() || item.createdAt?.trim() || "";
      const sortAtMs = sortSource ? Date.parse(sortSource) || 0 : 0;
      const card = formatEndedChargeCardDisplay(item);
      rows.push({
        key: item.id,
        rowKind: "posted",
        sortAtMs: Number.isFinite(sortAtMs) ? sortAtMs : 0,
        amountGbp: item.resolution === "waived" ? 0 : item.amountGbp,
        statusKey,
        searchText: [
          card.title,
          item.chargeTypeLabel,
          item.description,
          item.resolutionLabel,
          paymentRow?.statusLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        item,
      });
    }

    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => (statusFilter === "all" ? true : row.statusKey === statusFilter))
      .filter((row) => (!q ? true : row.searchText.includes(q)))
      .sort((a, b) => {
        if (sortKey === "amount") {
          return sortDir === "asc"
            ? a.amountGbp - b.amountGbp
            : b.amountGbp - a.amountGbp;
        }
        // Date — pending reviews pin to top when newest-first, bottom when oldest-first
        if (a.rowKind === "pending" && b.rowKind !== "pending") {
          return sortDir === "desc" ? -1 : 1;
        }
        if (b.rowKind === "pending" && a.rowKind !== "pending") {
          return sortDir === "desc" ? 1 : -1;
        }
        return sortDir === "asc" ? a.sortAtMs - b.sortAtMs : b.sortAtMs - a.sortAtMs;
      });
  }, [
    data.unpostedReturnCharges,
    paymentStatusById,
    pending,
    posted,
    search,
    sortDir,
    sortKey,
    statusFilter,
  ]);

  const pendingReviewTarget = useMemo(() => {
    const pendingPayment = data.extraChargePendingPayment;
    if (!pendingPayment) return null;
    const preview = previewExtraChargePendingAllocation({
      amountGbp: pendingPayment.amountGbp,
      rows: paymentRows,
      storedAllocations: pendingPayment.allocations,
    });
    const focus = reviewRow;
    const chargeLabel = focus
      ? focus.description
        ? `${focus.chargeTypeLabel} · ${focus.description}`
        : focus.chargeTypeLabel
      : "Extra charges";
    return {
      kind: "extra_charges" as const,
      hireGroupId,
      amountGbp: pendingPayment.amountGbp,
      paymentReference: pendingPayment.paymentReference,
      outstandingGbp: data.extraChargesOutstandingGbp,
      focusChargeLineItemId: focus?.id,
      title: chargeLabel,
      chargedGbp: focus?.chargedGbp,
      paidGbp: focus?.paidGbp,
      balanceGbp: focus?.balanceGbp,
      allocations: preview.allocations.map((line) => ({
        rowId: line.rowId,
        label: line.label,
        allocatedGbp: line.allocatedGbp,
        rowBalanceAfterGbp: line.rowBalanceAfterGbp,
        fullyAllocated: line.fullyAllocated,
      })),
    };
  }, [
    data.extraChargePendingPayment,
    data.extraChargesOutstandingGbp,
    hireGroupId,
    paymentRows,
    reviewRow,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hire-balance-panel-kicker">Return & extras</p>
          <h2 className="hire-balance-panel-title">Charges</h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Posted, waived and pending review charges for this ended hire. Hire-time posts stay
            read-only; pending reviews unlock actions after a decision.
          </p>
        </div>
        {data.canMutateExtraCharges ? (
          <button type="button" className="rph-btn-ghost" onClick={() => setAddOpen(true)}>
            Add adjustment
          </button>
        ) : (
          <Link href={`/rental/hires/${hireGroupId}`} className="rph-btn-ghost">
            View hire
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Search</span>
          <input
            className="rph-input w-full"
            placeholder="Charge, status, notes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="min-w-[10rem] space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Status</span>
          <RphSelect
            value={statusFilter}
            aria-label="Filter charges by status"
            options={[
              { value: "all", label: "All statuses" },
              { value: "pending_review", label: "Pending review" },
              { value: "open", label: "Open / on balance" },
              { value: "paid", label: "Paid" },
              { value: "waived", label: "Waived" },
            ]}
            onValueChange={(value) =>
              setStatusFilter(value as typeof statusFilter)
            }
          />
        </div>
      </div>

      <div className="rph-table-responsive">
        <div className="max-h-[min(60vh,28rem)] overflow-x-auto overflow-y-auto overscroll-y-contain">
        <table className="hire-ended-simple-table">
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col" aria-sort={sortKey === "date" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 uppercase tracking-[0.08em] text-[11px] font-semibold text-rph-fg-muted hover:text-rph-fg"
                  onClick={() => toggleColumnSort("date")}
                >
                  Date
                  <span className="tabular-nums text-[10px]" aria-hidden>
                    {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </th>
              <th scope="col">Status</th>
              <th scope="col" aria-sort={sortKey === "amount" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 uppercase tracking-[0.08em] text-[11px] font-semibold text-rph-fg-muted hover:text-rph-fg"
                  onClick={() => toggleColumnSort("amount")}
                >
                  Amount
                  <span className="tabular-nums text-[10px]" aria-hidden>
                    {sortKey === "amount" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </th>
              <th scope="col">Paid</th>
              <th scope="col">Balance</th>
              <th scope="col" className="hire-ended-simple-table-actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              if (row.rowKind === "pending") {
                const review = row.review;
                return (
                  <tr key={row.key}>
                    <td data-label="Charge">
                      <p className="font-medium text-rph-fg">{review.label}</p>
                      {review.detail ? (
                        <p className="text-xs text-rph-fg-secondary">{review.detail}</p>
                      ) : null}
                    </td>
                    <td data-label="Date" className="text-sm text-rph-fg-muted">
                      —
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
                    <td data-label="Paid" className="tabular-nums">
                      {formatGbp(0)}
                    </td>
                    <td data-label="Balance" className="tabular-nums">
                      {review.proposedGbp != null && review.proposedGbp > 0.005
                        ? formatGbp(review.proposedGbp)
                        : "—"}
                    </td>
                    <td data-label="Actions" className="hire-ended-simple-table-actions">
                      <span className="text-xs text-rph-fg-muted">—</span>
                    </td>
                  </tr>
                );
              }

              if (row.rowKind === "unposted") {
                const item = row.item;
                return (
                  <tr key={row.key}>
                    <td data-label="Charge">
                      <p className="font-medium text-rph-fg">{item.label}</p>
                    </td>
                    <td data-label="Date" className="text-sm text-rph-fg-muted">
                      —
                    </td>
                    <td data-label="Status">
                      <span className="rph-pill">On balance</span>
                    </td>
                    <td data-label="Amount" className="tabular-nums font-medium">
                      {formatGbp(item.amountGbp)}
                    </td>
                    <td data-label="Paid" className="tabular-nums">
                      {formatGbp(0)}
                    </td>
                    <td data-label="Balance" className="tabular-nums font-medium">
                      {formatGbp(item.amountGbp)}
                    </td>
                    <td data-label="Actions" className="hire-ended-simple-table-actions">
                      <span className="text-xs text-rph-fg-muted">—</span>
                    </td>
                  </tr>
                );
              }

              const item = row.item;
              const card = formatEndedChargeCardDisplay(item);
              const evidenceHref = formatEndedChargeEvidenceHref(hireGroupId, item);
              const paymentRow = paymentStatusById.get(item.id);
              const statusLabel = paymentRow?.statusLabel ?? item.resolutionLabel;
              const statusTone = paymentRow?.statusTone;
              const hireTimeLocked = staffManualChargeLockedAsHireTimePost({
                sourceKind: item.sourceKind,
                chargedOn: item.chargedOn,
                createdAt: item.createdAt,
                contractEndedYmd: data.contractEndedYmd,
              });
              const actionRow = paymentRow
                ? {
                    ...paymentRow,
                    canEdit: paymentRow.canEdit && !hireTimeLocked,
                    canVoid: paymentRow.canVoid && !hireTimeLocked,
                  }
                : null;
              const dateLabel = item.chargedOn
                ? formatUkDate(item.chargedOn)
                : item.createdAt
                  ? formatUkDateTime(item.createdAt)
                  : "—";
              return (
                <tr key={row.key}>
                  <td data-label="Charge">
                    <p className="font-medium text-rph-fg">{card.title}</p>
                    <p className="text-xs text-rph-fg-secondary">{item.chargeTypeLabel}</p>
                    {evidenceHref ? (
                      <Link
                        href={evidenceHref}
                        className="mt-1 inline-block text-xs font-medium text-rph-link hover:text-rph-link-hover"
                      >
                        View evidence
                      </Link>
                    ) : null}
                  </td>
                  <td data-label="Date" className="tabular-nums text-sm text-rph-fg-secondary">
                    {dateLabel}
                  </td>
                  <td data-label="Status">
                    {statusTone ? (
                      <span
                        className={`hire-ws-payments-status-pill ${extraChargePaymentStatusClass(statusTone)}`}
                      >
                        {statusLabel}
                      </span>
                    ) : (
                      statusLabel
                    )}
                  </td>
                  <td data-label="Amount" className="tabular-nums font-medium">
                    {item.resolution === "waived" ? formatGbp(0) : formatGbp(item.amountGbp)}
                  </td>
                  <td data-label="Paid" className="tabular-nums">
                    {formatGbp(
                      item.resolution === "waived" || item.resolution === "voided"
                        ? 0
                        : (paymentRow?.paidGbp ?? 0),
                    )}
                  </td>
                  <td data-label="Balance" className="tabular-nums font-medium">
                    {formatGbp(
                      item.resolution === "waived" || item.resolution === "voided"
                        ? 0
                        : (paymentRow?.balanceGbp ??
                            (item.resolution === "paid_now" ? 0 : item.amountGbp)),
                    )}
                  </td>
                  <td data-label="Actions" className="hire-ended-simple-table-actions">
                    {actionRow ? (
                      <HireExtraChargeRowActions
                        row={actionRow}
                        canMutate={data.canMutateExtraCharges}
                        canApprove={data.canApprovePayments}
                        onHistory={() => setHistory(item)}
                        onEdit={() => setEditing(item)}
                        onVoid={() => setVoiding(item)}
                        onReview={() => {
                          setReviewRow(actionRow);
                          setReviewOpen(true);
                        }}
                        onAmend={() => setAmending(actionRow)}
                      />
                    ) : (
                      <span className="text-xs text-rph-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-rph-fg-secondary">
                  {pending.length === 0 &&
                  posted.length === 0 &&
                  data.unpostedReturnCharges.length === 0
                    ? "No charges recorded on this hire."
                    : "No charges match your filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      <HireAddChargeModal
        hireGroupId={hireGroupId}
        open={addOpen || Boolean(editing)}
        charge={editing}
        headerMeta={data.vehicleVrm?.toUpperCase() ?? null}
        paymentAccounts={data.settlementPaymentAccounts ?? []}
        defaultPaymentAccountId={data.defaultSettlementPaymentAccountId ?? null}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={onReload}
      />
      <HireVoidChargeModal
        hireGroupId={hireGroupId}
        charge={voiding}
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        onVoided={onReload}
      />
      {history ? (
        <HireChargeHistoryModal
          hireGroupId={hireGroupId}
          chargeLineItemId={history.id}
          title={`${history.chargeTypeLabel} · ${formatGbp(history.amountGbp)}`}
          open
          onClose={() => setHistory(null)}
        />
      ) : null}
      {amending ? (
        <HireExtraChargeAmendPaymentModal
          hireGroupId={hireGroupId}
          row={amending}
          open
          onClose={() => setAmending(null)}
          onSuccess={onReload}
        />
      ) : null}
      <HirePaymentReviewModal
        target={pendingReviewTarget}
        open={reviewOpen && pendingReviewTarget != null}
        onClose={() => {
          setReviewOpen(false);
          setReviewRow(null);
        }}
        onSuccess={() => {
          setReviewOpen(false);
          setReviewRow(null);
          onReload();
        }}
      />
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
            : "Open a charge to approve or waive it. Waived charges stay on the Charges table."}
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
            unpaidChargesGbp={data.extraChargesOutstandingGbp}
            paymentAccounts={data.settlementPaymentAccounts ?? []}
            defaultPaymentAccountId={data.defaultSettlementPaymentAccountId ?? null}
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
          <PendingChargeReviewsTable
            hireGroupId={hireGroupId}
            charges={charges}
            confirmedBalanceGbp={confirmed.confirmedBalanceGbp}
            actionsDisabled={reviewsLocked}
            onSuccess={onReload}
          />
        </div>
      ) : !data.depositPendingReview ? (
        <p className="rounded-xl border border-rph-border bg-rph-page/60 px-4 py-6 text-sm text-rph-fg-secondary">
          No return charges are awaiting review.
        </p>
      ) : null}
    </div>
  );
}

function PendingChargeReviewsTable({
  hireGroupId,
  charges,
  confirmedBalanceGbp,
  actionsDisabled,
  onSuccess,
}: {
  hireGroupId: string;
  charges: HireEndedPendingChargeReview[];
  confirmedBalanceGbp: number;
  actionsDisabled: boolean;
  onSuccess: () => void;
}) {
  const [reviewing, setReviewing] = useState<HireEndedPendingChargeReview | null>(null);

  return (
    <>
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
            {charges.map((review) => {
              const proposedGbp =
                review.proposedGbp != null && review.proposedGbp > 0.005
                  ? review.proposedGbp
                  : null;
              const projectedGbp =
                proposedGbp != null ? roundGbp(confirmedBalanceGbp + proposedGbp) : null;
              return (
                <tr key={review.id}>
                  <td data-label="Charge">
                    <p className="font-medium text-rph-fg">{review.label}</p>
                    {review.detail ? (
                      <p className="text-xs text-rph-fg-secondary">{review.detail}</p>
                    ) : null}
                    {review.evidenceHref ? (
                      <Link
                        href={review.evidenceHref}
                        className="mt-1 inline-block text-xs font-medium text-rph-link hover:text-rph-link-hover"
                      >
                        View evidence
                      </Link>
                    ) : null}
                  </td>
                  <td data-label="Proposed" className="tabular-nums font-medium">
                    {proposedGbp != null ? formatGbp(proposedGbp) : "—"}
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
                    ) : (
                      <button
                        type="button"
                        className="rph-btn-primary h-8 px-2.5 text-xs"
                        onClick={() => setReviewing(review)}
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <HirePendingReturnChargeReviewModal
        open={Boolean(reviewing)}
        hireGroupId={hireGroupId}
        review={reviewing}
        confirmedBalanceGbp={confirmedBalanceGbp}
        onClose={() => setReviewing(null)}
        onSuccess={onSuccess}
      />
    </>
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
