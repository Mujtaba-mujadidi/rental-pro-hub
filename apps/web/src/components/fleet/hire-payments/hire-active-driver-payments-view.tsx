"use client";

import { useMemo, useState } from "react";
import {
  submitDriverHirePaymentAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HireUpcomingPaymentsTable } from "@/components/fleet/hire-payments/hire-upcoming-payments-table";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireWorkspaceStatCard } from "@/components/fleet/hire-workspace/hire-workspace-ui";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import {
  buildActiveHirePaymentPositionFromPage,
  buildFullPaymentScheduleSummary,
  depositOutstandingHint,
  formatNextPaymentHeading,
  rentDueToDateHint,
  rentPaidStatHint,
  rentPaymentPeriodSubtitle,
  selectUpcomingPaymentRows,
} from "@/lib/fleet/hire-active-payments-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { ukTodayYmd } from "@/lib/datetime/uk";

type HireActiveDriverPaymentsViewProps = {
  hireGroupId: string;
  data: HirePaymentsPageData;
  chrome: HireWorkspaceChromeData;
  highlightedRowIds: string[];
  onHighlightedRowIdsChange: (rowIds: string[]) => void;
  onReload: () => void;
  busy?: boolean;
};

export function HireActiveDriverPaymentsView({
  hireGroupId,
  data,
  chrome,
  highlightedRowIds,
  onHighlightedRowIdsChange,
  onReload,
  busy = false,
}: HireActiveDriverPaymentsViewProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const todayYmd = ukTodayYmd();
  const position = buildActiveHirePaymentPositionFromPage({
    summary: data.summary,
    paymentRows: data.rows,
    includeDeposit: chrome.includeDeposit,
    audience: "driver",
  });
  const depositRow = data.rows.find((row) => row.rowKind === "deposit") ?? null;
  const nextDue = data.summary.nextDue;
  const displayOptions = useMemo(
    () => ({ contractEndedYmd: data.contractEndedYmd, audience: "driver" as const }),
    [data.contractEndedYmd],
  );
  const upcomingRows = useMemo(
    () => selectUpcomingPaymentRows(data.rows, todayYmd, displayOptions),
    [data.rows, displayOptions, todayYmd],
  );
  const scheduleSummary = buildFullPaymentScheduleSummary(data.rows, data.summary.contractTotalGbp);
  const showDueBanner = position.currentlyDueGbp > 0.005 || nextDue != null;
  const bannerAmountGbp =
    position.currentlyDueGbp > 0.005 ? position.currentlyDueGbp : (nextDue?.amountGbp ?? 0);

  return (
    <div className="hire-ws-payments-layout space-y-4">
      <header className="hire-ws-payments-intro">
        <p className="hire-ws-section-kicker">Active hire</p>
        <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Payments</h1>
      </header>

      {showDueBanner ? (
        <section className="hire-ws-banner">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                Payment due today
              </span>
              <p className="mt-2 text-sm leading-relaxed text-white/90 sm:text-base">
                <span className="font-semibold text-white">Total you currently owe.</span>{" "}
                Deposit and rent are shown separately below.
              </p>
            </div>
            <p className="shrink-0 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">
              {formatGbp(bannerAmountGbp)}
            </p>
          </div>
        </section>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-3">
        <HireWorkspaceStatCard
          label="Deposit outstanding"
          value={formatGbp(position.depositOutstandingGbp)}
          hint={depositOutstandingHint(position.depositOutstandingGbp, depositRow?.paidGbp ?? 0)}
          warn={position.depositOutstandingGbp > 0.005}
        />
        <HireWorkspaceStatCard
          label="Rent due to date"
          value={formatGbp(position.rentDueToDateGbp)}
          hint={rentDueToDateHint(chrome.rentMetricLabel, chrome.frequencyPositionLabel)}
        />
        <HireWorkspaceStatCard
          label="Rent paid"
          value={formatGbp(position.rentPaidGbp)}
          hint={rentPaidStatHint(position.rentPaidGbp, position.rentOutstandingGbp)}
        />
      </div>

      <HireDepositPendingBanner
        hireGroupId={hireGroupId}
        closure={{
          depositPendingReview: data.depositPendingReview,
          depositGbp: data.depositGbp ?? 0,
          rentSettlementSettled: data.settlementBalance?.settled === true,
        }}
        audience="driver"
      />

      <section className="hire-ws-payments-panel">
        <header className="hire-ws-payments-panel-header flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-rph-fg">Upcoming payments</h2>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
              The current position is shown first; the full annual schedule stays collapsed below.
            </p>
          </div>
          {data.canSubmitPayment ? (
            <HirePaymentComposer
              hireGroupId={hireGroupId}
              scheduleRows={data.rows}
              scheduleBalanceGbp={data.summary.scheduleBalanceGbp}
              paymentAccount={data.paymentAccount}
              canSubmit
              asDriver
              submitLabel="Submit payment"
              triggerLabel="Submit payment"
              onAllocationChange={onHighlightedRowIdsChange}
              onSuccess={onReload}
              busy={busy}
              onSubmit={async (input) => {
                const res = await submitDriverHirePaymentAction({
                  hireGroupId,
                  amountGbp: input.amountGbp,
                  paymentReference: input.paymentReference,
                });
                if (res.ok) onReload();
                return res;
              }}
            />
          ) : null}
        </header>
        <HireUpcomingPaymentsTable
          rows={upcomingRows}
          canRecordOnRow={false}
          canApprove={false}
          canApplyDiscount={false}
          showActions={false}
          highlightedRowIds={highlightedRowIds}
          displayOptions={displayOptions}
          onRefresh={onReload}
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="hire-ws-payments-account-card">
          <h2 className="text-sm font-semibold text-rph-fg">Rent account to date</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <AccountRow label="Rent before discount" value={formatGbp(data.summary.rentGrossAccruedGbp)} />
            <AccountRow label="Discount applied" value={formatGbp(data.summary.totalDiscountGbp)} />
            <AccountRow label="Rent paid" value={`-${formatGbp(data.summary.totalPaidGbp)}`} />
          </dl>
          <div className="hire-ws-payments-account-footer">
            <span className="text-sm text-rph-fg-secondary">Outstanding rent</span>
            <span className="text-sm font-semibold tabular-nums text-rph-fg">
              {formatGbp(data.summary.balanceGbp)}
            </span>
          </div>
        </section>

        <section className="hire-ws-payments-next-card">
          <h2 className="text-sm font-semibold text-rph-fg">Next payment</h2>
          {nextDue ? (
            <>
              <div className="hire-ws-payments-next-highlight">
                <p className="text-sm font-semibold text-white">
                  {formatNextPaymentHeading(nextDue.periodStart, todayYmd)}
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">
                  {formatGbp(nextDue.amountGbp)}
                </p>
                <p className="mt-1 text-xs text-white/75">
                  {rentPaymentPeriodSubtitle(chrome.rentMetricLabel)}
                </p>
              </div>
              <p className="hire-ws-payments-next-note">
                Full contract value: {formatGbp(data.summary.contractTotalGbp)}. This is future scheduled rent,
                not currently owed.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-rph-fg-secondary">No further rent payments are scheduled.</p>
          )}
        </section>
      </div>

      <section className="hire-ws-payments-schedule-collapse">
        <button
          type="button"
          className="hire-ws-payments-schedule-toggle"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen((open) => !open)}
        >
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-rph-fg">Full annual payment schedule</span>
            <span className="mt-0.5 block text-xs text-rph-fg-secondary">{scheduleSummary}</span>
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
              highlightedRowIds={highlightedRowIds}
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

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-rph-fg-secondary">{label}</dt>
      <dd className="font-medium tabular-nums text-rph-fg">{value}</dd>
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
