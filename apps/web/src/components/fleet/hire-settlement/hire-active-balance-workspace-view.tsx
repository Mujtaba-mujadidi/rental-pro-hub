"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { HireSettlementWorkspaceData } from "@/app/actions/rental-hire-termination";
import { HireAddChargeModal } from "@/components/fleet/hire-charges/hire-add-charge-modal";
import { HireExtraChargesPanel } from "@/components/fleet/hire-charges/hire-extra-charges-panel";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { HireBalanceAccountStatementPanel } from "@/components/fleet/hire-settlement/hire-balance-account-statement-panel";
import { HireBalanceRentSchedulePanel } from "@/components/fleet/hire-settlement/hire-balance-rent-schedule-panel";
import { formatUkDateTextLong } from "@/lib/datetime/uk";
import {
  activeBalanceChargedPaidHint,
  activeBalanceDepositCardDisplay,
  activeBalanceFeaturedChargeMeta,
  activeBalanceHeaderPeriod,
  activeBalanceHeaderRentLine,
  activeBalanceHeroBreakdown,
  activeBalanceNextRentDueHint,
  activeBalanceOpenAmountGbp,
  activeBalanceRentAccountRows,
  selectFeaturedOutstandingExtraCharge,
} from "@/lib/fleet/hire-active-balance-display";
import { buildActiveHirePaymentPositionFromPage } from "@/lib/fleet/hire-active-payments-display";
import { buildExtraChargePaymentTableRowsFromWorkspace } from "@/lib/fleet/hire-driver-charge-payment";
import {
  formatEndedChargeCardDisplay,
  formatEndedChargeEvidenceHref,
} from "@/lib/fleet/hire-ended-payments-display";
import { formatGbp } from "@/lib/fleet/maintenance";

type BalanceTab = "overview" | "rent-schedule" | "extra-charges" | "account-statement";

const BALANCE_TABS: Array<{ id: BalanceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rent-schedule", label: "Rent schedule" },
  { id: "extra-charges", label: "Extra charges" },
  { id: "account-statement", label: "Account statement" },
];

export function HireActiveBalanceWorkspaceView({
  hireGroupId,
  data,
  onReload,
  embedded = false,
}: {
  hireGroupId: string;
  data: HireSettlementWorkspaceData;
  onReload: () => void;
  embedded?: boolean;
}) {
  const payments = data.activePayments;
  const metrics = data.activeBalanceMetrics;
  const [tab, setTab] = useState<BalanceTab>("overview");
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const headerPeriod = activeBalanceHeaderPeriod(data.activatedAt);
  const headerRentLine = activeBalanceHeaderRentLine(data.rentAmountGbp, data.rentCadence);
  const headerCompanyLine = [data.companyName?.trim(), headerRentLine].filter(Boolean).join(" · ");
  const headerMeta = [data.vehicleVrm, data.driverLabel].filter(Boolean).join(" · ");

  const position = useMemo(() => {
    if (!payments) return null;
    return buildActiveHirePaymentPositionFromPage({
      summary: payments.summary,
      paymentRows: payments.rows,
      includeDeposit: payments.rows.some((row) => row.rowKind === "deposit"),
      extraChargesOutstandingGbp: data.extraChargesOutstandingGbp,
      audience: "staff",
    });
  }, [data.extraChargesOutstandingGbp, payments]);

  const depositRow = payments?.rows.find((row) => row.rowKind === "deposit") ?? null;
  const depositCard = activeBalanceDepositCardDisplay({
    depositDueGbp: depositRow?.netDueGbp ?? 0,
    depositPaidGbp: depositRow?.paidGbp ?? 0,
    depositOutstandingGbp: position?.depositOutstandingGbp ?? 0,
  });

  const openBalanceGbp = position
    ? activeBalanceOpenAmountGbp(position.rentOutstandingGbp, position.extraChargesOutstandingGbp)
    : data.openBalanceGbp;
  const heroBreakdown = position
    ? activeBalanceHeroBreakdown(position.rentOutstandingGbp, position.extraChargesOutstandingGbp)
    : null;
  const nextDue = payments?.summary.nextDue ?? null;

  const extraChargeRows = useMemo(
    () =>
      buildExtraChargePaymentTableRowsFromWorkspace({
        hireGroupId,
        items: data.driverChargeLineItems,
        outstandingGbp: data.extraChargesOutstandingGbp,
        pendingAmountGbp: payments?.extraChargePendingPayment?.amountGbp,
        allowMutate: payments?.canMutateExtraCharges,
      }),
    [data.driverChargeLineItems, data.extraChargesOutstandingGbp, hireGroupId, payments],
  );

  const featuredCharge = useMemo(() => {
    const row = selectFeaturedOutstandingExtraCharge(extraChargeRows);
    if (!row) return null;
    const item = data.driverChargeLineItems.find((charge) => charge.id === row.id);
    if (!item) return null;
    const card = formatEndedChargeCardDisplay(item);
    const evidenceHref = formatEndedChargeEvidenceHref(hireGroupId, item);
    return {
      row,
      item,
      card,
      evidenceHref,
      meta: activeBalanceFeaturedChargeMeta({
        createdAt: item.createdAt,
        hasEvidence: Boolean(evidenceHref),
      }),
    };
  }, [data.driverChargeLineItems, extraChargeRows, hireGroupId]);

  const rentAccountRows = payments
    ? activeBalanceRentAccountRows({
        scheduledRentGbp: payments.summary.rentGrossAccruedGbp,
        discountGbp: payments.summary.totalDiscountGbp,
        rentPaidGbp: payments.summary.totalPaidGbp,
        rentOutstandingGbp: payments.summary.balanceGbp,
      })
    : [];

  const canRecordPayment =
    data.canWrite && openBalanceGbp > 0.005 && Boolean(payments?.canSubmitPayment);
  const canMutateCharges = data.canWrite;

  const switchToExtraCharges = useCallback(() => setTab("extra-charges"), []);
  const switchToRentSchedule = useCallback(() => setTab("rent-schedule"), []);

  if (!payments || !position || !metrics) {
    return <p className="rph-alert-error text-sm">Unable to load active balance details.</p>;
  }

  return (
    <div className="hire-balance-workspace">
      {!embedded ? (
        <header className="hire-balance-page-header">
          <div className="hire-balance-page-header-top">
            <Link href="/rental/balances" className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
              ← Back to balances
            </Link>
            <div className="hire-balance-page-header-tools-desktop">
              <BalanceHeaderTools hireGroupId={hireGroupId} />
            </div>
          </div>
          <div className="hire-balance-page-header-meta">
            <span className="hire-balance-page-badge">Active hire</span>
            {data.balanceReference ? (
              <span className="hire-balance-page-reference">{data.balanceReference}</span>
            ) : null}
          </div>
          <h1 className="hire-balance-page-title">Payments & balance</h1>
          <p className="hire-balance-page-line">
            {data.vehicleVrm ? <span className="font-semibold text-rph-fg">{data.vehicleVrm}</span> : null}
            {data.driverLabel ? (
              <>
                {data.vehicleVrm ? " · " : null}
                {data.driverLabel}
              </>
            ) : null}
            {(data.vehicleVrm || data.driverLabel) && headerPeriod ? " · " : null}
            {headerPeriod}
          </p>
          {headerCompanyLine ? <p className="hire-balance-page-line">{headerCompanyLine}</p> : null}
          <div className="hire-balance-page-header-tools-mobile">
            <BalanceHeaderTools hireGroupId={hireGroupId} stacked />
            {tab === "account-statement" && canRecordPayment ? (
              <HireAllocatedPaymentComposer
                hireGroupId={hireGroupId}
                payments={payments}
                submitLabel="Record payment"
                triggerLabel="Record payment"
                triggerClassName="rph-btn-primary h-10 w-full"
                onAllocationChange={setHighlightedRowIds}
                onSuccess={onReload}
              />
            ) : null}
          </div>
        </header>
      ) : null}

      <section className={tab === "account-statement" ? "hire-balance-shell hire-balance-shell-statement" : "hire-balance-shell"}>
        <nav className="hire-balance-tabs" aria-label="Balance sections">
          {BALANCE_TABS.map((item) => (
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

        <div className={tab === "account-statement" ? "hire-balance-shell-body hire-balance-shell-body-statement" : "hire-balance-shell-body"}>
      {tab === "overview" ? (
        <div className="hire-balance-overview">
          {openBalanceGbp > 0.005 ? (
            <section className="hire-balance-hero">
              <div className="hire-balance-hero-inner">
                <div className="min-w-0">
                  <span className="hire-balance-hero-badge">Outstanding balance</span>
                  <p className="hire-balance-hero-label">Driver currently owes</p>
                  <p className="hire-balance-hero-amount">{formatGbp(openBalanceGbp)}</p>
                  {heroBreakdown ? <p className="hire-balance-hero-breakdown">{heroBreakdown}</p> : null}
                </div>
                {canRecordPayment && payments ? (
                  <div className="shrink-0">
                    <HireAllocatedPaymentComposer
                      hireGroupId={hireGroupId}
                      payments={payments}
                      submitLabel="Record payment"
                      triggerLabel="Record payment"
                      triggerClassName="rph-btn-primary"
                      onAllocationChange={setHighlightedRowIds}
                      onSuccess={onReload}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="hire-balance-kpi-grid">
            <div className={`hire-balance-kpi${depositCard.warn ? " hire-balance-kpi-warn" : ""}`}>
              <p className="hire-balance-kpi-label">Deposit</p>
              <p
                className={`hire-balance-kpi-value${depositCard.paid ? " hire-balance-kpi-value-paid" : ""}`}
              >
                {depositCard.value}
              </p>
              <p className="hire-balance-kpi-hint">{depositCard.hint}</p>
            </div>
            <div
              className={`hire-balance-kpi${position.rentOutstandingGbp > 0.005 ? " hire-balance-kpi-warn" : ""}`}
            >
              <p className="hire-balance-kpi-label">Outstanding rent</p>
              <p className="hire-balance-kpi-value">{formatGbp(position.rentOutstandingGbp)}</p>
              <p className="hire-balance-kpi-hint">
                {activeBalanceChargedPaidHint(
                  Math.max(0, payments.summary.totalDueGbp),
                  payments.summary.totalPaidGbp,
                )}
              </p>
            </div>
            <div
              className={`hire-balance-kpi${position.extraChargesOutstandingGbp > 0.005 ? " hire-balance-kpi-warn" : ""}`}
            >
              <p className="hire-balance-kpi-label">Outstanding extras</p>
              <p className="hire-balance-kpi-value">{formatGbp(position.extraChargesOutstandingGbp)}</p>
              <p className="hire-balance-kpi-hint">
                {activeBalanceChargedPaidHint(metrics.extraChargesGbp, metrics.extraChargesPaidGbp)}
              </p>
            </div>
            <div className="hire-balance-kpi">
              <p className="hire-balance-kpi-label">Next future rent</p>
              <p className="hire-balance-kpi-value">{nextDue ? formatGbp(nextDue.amountGbp) : "—"}</p>
              <p className="hire-balance-kpi-hint">
                {nextDue ? activeBalanceNextRentDueHint(nextDue.periodStart) : "No future rent scheduled"}
              </p>
            </div>
          </div>

          <div className="hire-balance-detail-grid">
            <section className="hire-balance-panel">
              <div className="hire-balance-panel-head">
                <div>
                  <p className="driver-dash-section-label">Rent to date</p>
                  <h2 className="hire-balance-panel-title">Rent account</h2>
                </div>
                <button type="button" className="hire-balance-panel-link" onClick={switchToRentSchedule}>
                  View schedule
                </button>
              </div>
              <dl className="hire-balance-ledger">
                {rentAccountRows.slice(0, -1).map((row) => (
                  <div key={row.label} className="hire-balance-ledger-row">
                    <dt className="hire-balance-ledger-label">{row.label}</dt>
                    <dd className="hire-balance-ledger-value">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="hire-balance-ledger-footer">
                <span className="text-sm font-semibold text-rph-fg">Outstanding rent</span>
                <span className="text-sm font-semibold tabular-nums text-rph-fg">
                  {rentAccountRows.at(-1)?.value ?? formatGbp(0)}
                </span>
              </div>
            </section>

            <section className="hire-balance-panel">
              <div className="hire-balance-panel-head">
                <div>
                  <p className="driver-dash-section-label">Next scheduled</p>
                  <h2 className="hire-balance-panel-title">Future rent payment</h2>
                </div>
                {nextDue ? <span className="hire-balance-status-pill">Not yet owed</span> : null}
              </div>
              {nextDue ? (
                <>
                  <p className="hire-balance-future-date">{formatUkDateTextLong(nextDue.periodStart)}</p>
                  <p className="hire-balance-future-amount">{formatGbp(nextDue.amountGbp)}</p>
                  <p className="hire-balance-future-note">
                    This is the next future rent period. Existing overdue rent is included in the balance above.
                  </p>
                </>
              ) : (
                <p className="mt-4 text-sm text-rph-fg-secondary">No further rent payments are scheduled.</p>
              )}
            </section>
          </div>

          {featuredCharge ? (
            <section className="hire-balance-panel">
              <div className="hire-balance-panel-head">
                <div>
                  <p className="driver-dash-section-label">Additional charge</p>
                  <h2 className="hire-balance-panel-title">{featuredCharge.item.chargeTypeLabel} charge</h2>
                </div>
                <button type="button" className="hire-balance-panel-link" onClick={switchToExtraCharges}>
                  View all charges
                </button>
              </div>
              <div className="hire-balance-charge-row">
                <div className="hire-balance-charge-main">
                  <span className="hire-balance-charge-icon" aria-hidden>
                    !
                  </span>
                  <div className="min-w-0">
                    <p className="hire-balance-charge-title">{featuredCharge.card.title}</p>
                    <p className="hire-balance-charge-meta">{featuredCharge.meta}</p>
                  </div>
                </div>
                <div className="hire-balance-charge-actions">
                  <div className="hire-balance-charge-metrics">
                    <div>
                      <p className="hire-balance-charge-metric-label">Charged</p>
                      <p className="hire-balance-charge-metric-value">{formatGbp(featuredCharge.row.dueGbp)}</p>
                    </div>
                    <div>
                      <p className="hire-balance-charge-metric-label">Paid</p>
                      <p className="hire-balance-charge-metric-value">{formatGbp(featuredCharge.row.paidGbp)}</p>
                    </div>
                    <div>
                      <p className="hire-balance-charge-metric-label">Outstanding</p>
                      <p className="hire-balance-charge-metric-value hire-balance-charge-metric-value-strong">
                        {formatGbp(featuredCharge.row.balanceGbp)}
                      </p>
                    </div>
                  </div>
                  {featuredCharge.evidenceHref ? (
                    <Link href={featuredCharge.evidenceHref} className="hire-ws-charges-evidence-btn">
                      <EyeIcon />
                      View evidence
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "rent-schedule" ? (
        <HireBalanceRentSchedulePanel
          hireGroupId={hireGroupId}
          payments={payments}
          rentCadence={data.rentCadence}
          highlightedRowIds={highlightedRowIds}
          canRecordPayment={canRecordPayment}
          pending={false}
          onReload={onReload}
          onAllocationChange={setHighlightedRowIds}
        />
      ) : null}

      {tab === "extra-charges" ? (
        <HireExtraChargesPanel
          hireGroupId={hireGroupId}
          items={data.driverChargeLineItems}
          outstandingGbp={data.extraChargesOutstandingGbp}
          pendingPayment={payments.extraChargePendingPayment}
          canMutate={payments.canMutateExtraCharges}
          canApprovePayments={payments.canApprovePayments}
          payments={payments}
          onReload={onReload}
          onAllocationChange={setHighlightedRowIds}
        />
      ) : null}

      {tab === "account-statement" ? (
        <HireBalanceAccountStatementPanel
          hireGroupId={hireGroupId}
          statement={data.statement}
          rentChargedAfterDiscountGbp={Math.max(
            0,
            Math.round((payments.summary.rentGrossAccruedGbp - payments.summary.totalDiscountGbp) * 100) / 100,
          )}
          extraChargesGbp={metrics.extraChargesGbp}
          currentBalanceGbp={openBalanceGbp}
          payments={payments}
          canRecordPayment={canRecordPayment}
          canAddCharge={canMutateCharges}
          pending={false}
          onReload={onReload}
          onAddCharge={() => setAddOpen(true)}
        />
      ) : null}
        </div>
      </section>

      <HireAddChargeModal
        hireGroupId={hireGroupId}
        open={addOpen}
        headerMeta={headerMeta}
        onClose={() => setAddOpen(false)}
        onSaved={onReload}
      />
    </div>
  );
}

function BalanceHeaderTools({ hireGroupId, stacked = false }: { hireGroupId: string; stacked?: boolean }) {
  return (
    <div className={stacked ? "hire-balance-page-header-tools-row" : "flex flex-wrap items-center gap-2"}>
      <HirePaymentStatementDownloadButton
        hireGroupId={hireGroupId}
        variant="default"
        source="balance-account"
        className={stacked ? "w-full min-w-0 items-stretch" : undefined}
      />
      <Link
        href={`/rental/hires/${hireGroupId}`}
        className={stacked ? "rph-btn-ghost h-9 w-full justify-center px-3 text-xs" : "rph-btn-ghost h-9 px-3 text-xs"}
      >
        Hire workspace
      </Link>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
