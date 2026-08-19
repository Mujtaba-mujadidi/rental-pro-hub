"use client";

import Link from "next/link";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import {
  buildActiveHirePaymentPosition,
  buildActiveHirePaymentRatingDisplay,
} from "@/lib/fleet/hire-active-summary-display";
import { buildHireSummaryActionItems, type HireSummaryActionItem } from "@/lib/fleet/hire-summary-action-items";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import { RENT_CADENCE_LABELS } from "@/lib/fleet/hire-access-display";
import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  HireWorkspaceProgressBar,
  HireWorkspaceStatCard,
} from "@/components/fleet/hire-workspace/hire-workspace-ui";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireActiveSummaryProgress } from "@/components/fleet/hire-summary/hire-active-summary-progress";
import { InsuranceDocumentIcon } from "@/components/fleet/insurance-document-icon";

function paymentRatingProgressTone(
  level: "on_track" | "attention" | "at_risk",
): "ok" | "warn" | "danger" {
  if (level === "on_track") return "ok";
  if (level === "at_risk") return "danger";
  return "warn";
}

export function HireActiveCompanySummary({
  data,
  context,
  chrome,
  paymentRows,
  extraChargesOutstandingGbp,
  paymentsHref,
  detailsHref,
  onRecordPayment,
}: {
  data: HireDashboardData;
  context: HireOverviewContext;
  chrome: HireWorkspaceChromeData;
  paymentRows: readonly HirePaymentPageRow[];
  extraChargesOutstandingGbp?: number;
  paymentsHref: string;
  detailsHref: string;
  onRecordPayment?: () => void;
}) {
  const position = buildActiveHirePaymentPosition({
    includeDeposit: data.includeDeposit,
    summary: data.summary,
    paymentRows,
    extraChargesOutstandingGbp,
  });
  const rating = buildActiveHirePaymentRatingDisplay({
    health: data.health,
    position,
    attentionItems: data.attentionItems,
    includeDeposit: data.includeDeposit,
  });
  const nextDue = data.summary.nextDue;
  const cadenceLabel = RENT_CADENCE_LABELS[context.rentCadence] ?? context.rentCadence;
  const actionItems = buildHireSummaryActionItems({
    lifecycleAttentionItems: data.lifecycleAttentionItems,
    attentionItems: data.attentionItems,
    position,
    paymentsHref,
    includeDeposit: data.includeDeposit,
  });

  const checkoutOdometer =
    chrome.checkout?.odometerMiles != null
      ? `${chrome.checkout.odometerMiles.toLocaleString("en-GB")} mi`
      : "—";
  const checkoutFuel =
    chrome.checkout?.fuelLevelPercent != null
      ? formatHireFuelLevelPercent(chrome.checkout.fuelLevelPercent).replace("Not recorded", "—")
      : "—";

  const rentPaidHint =
    position.rentPaidGbp <= 0.005 && position.rentDueToDateGbp > 0.005
      ? "First payment due today"
      : position.rentPaidGbp <= 0.005
        ? "No rent recorded yet"
        : "Recorded on this hire";

  const showDueBanner = position.currentlyDueGbp > 0.005 || nextDue;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {showDueBanner ? (
          <section className="hire-ws-banner">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                  Payment due today
                </span>
                <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                  {formatGbp(position.currentlyDueGbp > 0.005 ? position.currentlyDueGbp : nextDue?.amountGbp ?? 0)}
                  <span className="text-base font-semibold sm:text-lg">
                    {position.currentlyDueGbp > 0.005 ? " is currently due" : " due next"}
                  </span>
                </h2>
                {position.dueBreakdownLabel ? (
                  <p className="mt-1 text-xs text-white/75 sm:text-sm">{position.dueBreakdownLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
                {nextDue ? (
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">Next rent payment</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">{formatGbp(nextDue.amountGbp)}</p>
                    <p className="text-xs text-white/70">{formatUkDate(nextDue.periodStart)}</p>
                  </div>
                ) : null}
                {onRecordPayment ? (
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center rounded-lg bg-white px-3.5 text-xs font-semibold text-rph-rail hover:bg-white/90"
                    onClick={onRecordPayment}
                  >
                    Record payment
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-3">
          <HireWorkspaceStatCard
            label="Deposit outstanding"
            value={formatGbp(position.depositOutstandingGbp)}
            hint={
              position.depositOutstandingGbp > 0.005
                ? "Due before or at vehicle handover"
                : "No deposit due"
            }
            warn={position.depositOutstandingGbp > 0.005}
          />
          <HireWorkspaceStatCard
            label="Rent due to date"
            value={formatGbp(position.rentDueToDateGbp)}
            hint={context.frequencyPositionLabel}
          />
          <HireWorkspaceStatCard
            label="Rent paid"
            value={formatGbp(position.rentPaidGbp)}
            hint={rentPaidHint}
          />
        </div>
      </div>

      <HireDepositPendingBanner
        hireGroupId={context.hireGroupId}
        closure={data.financialClosure}
        audience="staff"
      />

      <section className="hire-ws-compact-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 flex-1 gap-2.5">
            <span className="hire-ws-icon-tile" aria-hidden>
              <PaymentRatingIcon />
            </span>
            <div className="min-w-0">
              <p className="hire-ws-section-kicker">Driver payment rating</p>
              <h3
                className={`mt-0.5 text-sm font-semibold ${
                  rating.level === "on_track"
                    ? "text-emerald-800 dark:text-emerald-200"
                    : rating.level === "at_risk"
                      ? "text-red-800 dark:text-red-200"
                      : "text-amber-900 dark:text-amber-100"
                }`}
              >
                {rating.label}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-rph-fg-secondary sm:text-sm">
                {rating.detail}
              </p>
            </div>
          </div>

          {rating.scorePercent != null ? (
            <>
              <div className="hire-ws-rating-divider" aria-hidden />
              <div className="w-full shrink-0 lg:w-52">
                <p className="text-right text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                  Current payment score
                </p>
                <p className="mt-0.5 text-right text-2xl font-semibold tabular-nums text-rph-fg">
                  {rating.scorePercent}%
                </p>
                <div className="mt-1.5">
                  <HireWorkspaceProgressBar
                    percent={rating.scorePercent}
                    tone={paymentRatingProgressTone(rating.level)}
                  />
                </div>
                {rating.scoreHint ? (
                  <p className="mt-1.5 text-right text-[11px] text-rph-fg-muted">{rating.scoreHint}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="hire-ws-compact-card h-full">
          <h2 className="text-sm font-semibold text-rph-fg">Hire at a glance</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">
            The live position, key dates and current rental terms.
          </p>
          <dl className="hire-ws-glance-grid">
            <GlanceCell label="Active since" value={context.startAtLabel} />
            <GlanceCell label="Contract end" value={context.scheduledEndAtLabel ?? "—"} hint={`${cadenceLabel} term`} />
            <GlanceCell label="Daily rent" value={context.rentLabel ?? "—"} hint={context.frequencyPositionLabel} />
            <GlanceCell label="Checkout reading" value={checkoutOdometer} hint={`Fuel at checkout: ${checkoutFuel}`} />
          </dl>
          <p className="mt-3 border-t border-rph-border pt-3">
            <Link href={detailsHref} className="rph-open-link-sm">
              View hire details →
            </Link>
          </p>
        </section>

        <section className="hire-ws-compact-card h-full">
          <h2 className="text-sm font-semibold text-rph-fg">Action needed</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">Items requiring company follow-up.</p>
          {actionItems.length ? (
            <ul className="hire-ws-action-list-scroll divide-y divide-rph-border">
              {actionItems.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="hire-ws-action-row">
                    <ActionNeededIcon item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-rph-fg">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] text-rph-fg-muted">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-rph-fg-muted" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-rph-fg-muted">Nothing requiring follow-up right now.</p>
          )}
        </section>
      </div>

      <HireActiveSummaryProgress
        lifecycle={data.lifecycle}
        hireGroupId={context.hireGroupId}
        checkoutCompleted={chrome.checkout != null}
        checkoutCompletedAtLabel={chrome.checkout?.completedAtLabel ?? null}
        activeSinceLabel={context.startAtLabel}
        agreementsSigned={data.lifecycle.documentsStatusLabel === "All signed"}
        workspaceBase={`/rental/hires/${context.hireGroupId}`}
        audience="staff"
      />
    </div>
  );
}

function GlanceCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-rph-border/70 bg-rph-page/50 px-3 py-2.5">
      <dt className="hire-ws-section-kicker">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-rph-fg">{value}</dd>
      {hint ? <dd className="mt-0.5 text-[11px] text-rph-fg-muted">{hint}</dd> : null}
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

function ActionWarningIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function ActionNeededIcon({ item }: { item: HireSummaryActionItem }) {
  if (item.icon === "pound") {
    return (
      <span className="hire-ws-action-icon hire-ws-action-icon-pound" aria-hidden>
        £
      </span>
    );
  }
  if (item.icon === "count" && item.iconCount != null) {
    return (
      <span className="hire-ws-action-icon hire-ws-action-icon-count" aria-hidden>
        {item.iconCount}
      </span>
    );
  }
  if (item.icon === "insurance") {
    return (
      <span className="hire-ws-action-icon hire-ws-action-icon-insurance" aria-hidden>
        <InsuranceDocumentIcon />
      </span>
    );
  }
  return (
    <span className="hire-ws-action-icon hire-ws-action-icon-warning" aria-hidden>
      <ActionWarningIcon />
    </span>
  );
}
