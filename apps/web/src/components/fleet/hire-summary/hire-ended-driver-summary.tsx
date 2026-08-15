"use client";

import Link from "next/link";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireCheckoutGlanceData } from "@/app/actions/hire-inspections";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import {
  buildHireEndedGlanceDisplay,
  buildHireEndedOutstandingBalance,
  buildHireEndedRefundCalculation,
  buildHireEndedSummaryStats,
  buildEndedHirePaymentRatingDisplay,
} from "@/lib/fleet/hire-ended-summary-display";
import { formatHireRentMetricLabel } from "@/lib/fleet/hire-access-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { HireWorkspaceStatCard, HireWorkspaceProgressBar } from "@/components/fleet/hire-workspace/hire-workspace-ui";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireEndedSummaryProgress } from "@/components/fleet/hire-summary/hire-active-summary-progress";

function paymentRatingProgressTone(
  level: "on_track" | "attention" | "at_risk",
): "ok" | "warn" | "danger" {
  if (level === "on_track") return "ok";
  if (level === "at_risk") return "danger";
  return "warn";
}

export function HireEndedDriverSummary({
  data,
  context,
  payments,
  checkout,
  workspaceBase,
  paymentsHref,
  detailsHref,
}: {
  data: HireDashboardData;
  context: HireOverviewContext;
  payments: HirePaymentsPageData;
  checkout: HireCheckoutGlanceData | null;
  workspaceBase: string;
  paymentsHref: string;
  detailsHref: string;
}) {
  const stats = buildHireEndedSummaryStats({ dashboard: data, payments, audience: "driver" });
  const outstanding = buildHireEndedOutstandingBalance(payments, {
    refundPaidGbp: stats.refundPaidGbp,
    audience: "driver",
  });
  const rating = buildEndedHirePaymentRatingDisplay({
    health: data.health,
    outstanding,
    audience: "driver",
  });
  const glance = buildHireEndedGlanceDisplay({ context, payments });
  const refundCalculation = buildHireEndedRefundCalculation({
    terminationSummary: payments.terminationSummary,
    driverChargesGbp: stats.driverChargesGbp,
    settlementPaymentsToDriverGbp: stats.refundPaidGbp,
  });
  const billableCharges = payments.driverChargeLineItems.filter(
    (item) =>
      (item.resolution === "add_to_balance" || item.resolution === "paid_now") && item.amountGbp > 0.005,
  );

  return (
    <div className="space-y-3">
      {outstanding.settled ? (
        <section className="hire-ws-settled-banner">
          <div className="hire-ws-settled-banner-main">
            <span className="hire-ws-settled-banner-icon" aria-hidden>
              <CheckIcon />
            </span>
            <div className="min-w-0">
              {outstanding.kicker ? (
                <p className="hire-ws-settled-banner-kicker">{outstanding.kicker}</p>
              ) : null}
              <h2 className="hire-ws-settled-banner-title">{outstanding.headline}</h2>
              {outstanding.detail ? (
                <p className="mt-1 text-xs text-rph-fg-secondary sm:text-sm">{outstanding.detail}</p>
              ) : null}
            </div>
          </div>
          <div className="hire-ws-settled-banner-balance">
            <p className="hire-ws-section-kicker">Outstanding balance</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-rph-fg">
              {formatGbp(outstanding.amountGbp)}
            </p>
            <span className="hire-ws-settled-banner-badge">{outstanding.statusLabel}</span>
          </div>
        </section>
      ) : (
        <section className="hire-ws-banner">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-white sm:text-2xl">{outstanding.headline}</h2>
              {outstanding.detail ? (
                <p className="mt-1 text-xs text-white/75 sm:text-sm">{outstanding.detail}</p>
              ) : null}
            </div>
            <div className="text-left lg:text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
                Outstanding balance
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
                {formatGbp(outstanding.amountGbp)}
              </p>
              <span className="mt-1 inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                {outstanding.statusLabel}
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-2.5 sm:grid-cols-3">
        <HireWorkspaceStatCard
          label="Rent settled"
          value={formatGbp(stats.rentSettledGbp)}
          hint={stats.rentSettledHint}
        />
        <HireWorkspaceStatCard
          label="Charges applied"
          value={formatGbp(stats.driverChargesGbp)}
          hint={stats.driverChargesHint}
        />
        <HireWorkspaceStatCard
          label="Refund received"
          value={
            <span className={stats.refundPaidGbp > 0.005 ? "text-emerald-700 dark:text-emerald-300" : undefined}>
              {formatGbp(stats.refundPaidGbp)}
            </span>
          }
          hint={stats.refundPaidHint}
        />
      </div>

      <HireDepositPendingBanner
        hireGroupId={context.hireGroupId}
        closure={data.financialClosure}
        audience="driver"
      />

      <section className="hire-ws-compact-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <span className={`hire-ws-rating-icon hire-ws-rating-icon-${rating.level}`} aria-hidden>
            <PaymentRatingIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="hire-ws-section-kicker">Your payment rating</p>
            <h3 className={`mt-0.5 text-sm font-semibold hire-ws-rating-label-${rating.level}`}>
              {rating.label}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-rph-fg-secondary sm:text-sm">
              {rating.detail}
            </p>
          </div>

          {rating.scorePercent != null ? (
            <>
              <div className="hire-ws-rating-divider" aria-hidden />
              <div className="w-full shrink-0 lg:w-52">
                <p className="text-right text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                  Payment score
                </p>
                <p className="mt-0.5 text-right text-2xl font-semibold tabular-nums text-rph-fg">
                  {rating.scorePercent}%
                </p>
                <div className="mt-2">
                  <HireWorkspaceProgressBar
                    percent={rating.scorePercent}
                    tone={paymentRatingProgressTone(rating.level)}
                  />
                </div>
                <p className="mt-1.5 text-right text-[11px] text-rph-fg-muted">
                  Based on on-time rent payments for this hire
                </p>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="hire-ws-compact-card h-full">
          <h2 className="text-sm font-semibold text-rph-fg">Hire at a glance</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">Key dates and rental terms for your ended hire.</p>
          <dl className="hire-ws-glance-grid">
            <GlanceCell label="Hire period" value={glance.hirePeriodLabel} />
            <GlanceCell label={formatHireRentMetricLabel(context.rentCadence)} value={glance.rentLabel} />
            <GlanceCell label="Deposit paid" value={glance.depositReceivedLabel} />
            <GlanceCell label="Hire ended" value={glance.contractEndedLabel} />
          </dl>
          <p className="mt-3 border-t border-rph-border pt-3">
            <Link href={detailsHref} className="rph-open-link-sm">
              View hire details →
            </Link>
          </p>
        </section>

        <section className="hire-ws-compact-card h-full">
          <h2 className="text-sm font-semibold text-rph-fg">Charges on your account</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">
            Amounts applied after vehicle return on this hire.
          </p>
          {billableCharges.length ? (
            <ul className="mt-2 divide-y divide-rph-border">
              {billableCharges.map((charge) => (
                <li key={charge.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rph-fg">{charge.chargeTypeLabel}</p>
                    {charge.description ? (
                      <p className="mt-0.5 text-[11px] text-rph-fg-muted">{charge.description}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-rph-fg">
                    {formatGbp(charge.amountGbp)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-rph-fg-muted">No charges were applied on this hire.</p>
          )}
          <p className="mt-3 border-t border-rph-border pt-3">
            <Link href={paymentsHref} className="rph-open-link-sm">
              View payments →
            </Link>
          </p>
        </section>
      </div>

      {refundCalculation?.visible ? (
        <section className="hire-ws-compact-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-rph-fg">How your refund was calculated</h2>
              <p className="mt-0.5 text-xs text-rph-fg-secondary">
                Your deposit was applied to rent and charges before your refund was paid.
              </p>
            </div>
            <Link href={paymentsHref} className="rph-btn-ghost h-8 shrink-0 px-3 text-xs">
              View all payments
            </Link>
          </div>

          <div className="hire-ws-refund-flow mt-4">
            <RefundFlowStep label="Original deposit" value={formatGbp(refundCalculation.originalDepositGbp)} />
            <RefundFlowOperator symbol="−" />
            <RefundFlowStep label="Rent from deposit" value={formatGbp(refundCalculation.rentFromDepositGbp)} />
            <RefundFlowOperator symbol="−" />
            <RefundFlowStep label="Charges" value={formatGbp(refundCalculation.driverChargesGbp)} />
            <RefundFlowOperator symbol="=" />
            <RefundFlowStep
              label="Refund you received"
              value={formatGbp(refundCalculation.finalRefundPaidGbp)}
              highlight
            />
          </div>
        </section>
      ) : null}

      <HireEndedSummaryProgress
        activeSinceLabel={context.startAtLabel}
        endedAtLabel={context.endedAtLabel ?? payments.contractEndedAtLabel}
        checkoutCompleted={checkout != null}
        checkoutCompletedAtLabel={checkout?.completedAtLabel ?? null}
        checkinCompleted={payments.checkinCompleted}
        settlementSettled={payments.settlementBalance?.settled === true}
        workspaceBase={workspaceBase}
        audience="driver"
      />
    </div>
  );
}

function GlanceCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rph-border/70 bg-rph-page/50 px-3 py-2.5">
      <dt className="hire-ws-section-kicker">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-rph-fg">{value}</dd>
    </div>
  );
}

function RefundFlowStep({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "hire-ws-refund-step hire-ws-refund-step-highlight" : "hire-ws-refund-step"}>
      <p className="hire-ws-section-kicker">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-rph-fg sm:text-base">{value}</p>
    </div>
  );
}

function RefundFlowOperator({ symbol }: { symbol: string }) {
  return (
    <div className="hire-ws-refund-operator" aria-hidden>
      {symbol}
    </div>
  );
}

function PaymentRatingIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
