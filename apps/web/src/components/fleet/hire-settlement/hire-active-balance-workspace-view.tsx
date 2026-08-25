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
  activeBalanceRentAccountRows,
  selectFeaturedOutstandingExtraCharge,
} from "@/lib/fleet/hire-active-balance-display";
import { buildActiveHirePaymentPositionFromPage } from "@/lib/fleet/hire-active-payments-display";
import { computeHireExtraChargePaymentTableRowsFromWorkspace } from "@/lib/fleet/hire-finance";
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
  const handleHighlightedRowIdsChange = useCallback((rowIds: string[]) => {
    setHighlightedRowIds((prev) =>
      prev.length === rowIds.length && prev.every((id, i) => id === rowIds[i]) ? prev : rowIds,
    );
  }, []);
  const [addOpen, setAddOpen] = useState(false);

  const headerPeriod = activeBalanceHeaderPeriod(data.activatedAt);
  const headerRentLine = activeBalanceHeaderRentLine(data.rentAmountGbp, data.rentCadence);
  const headerCompanyLine = [data.companyName?.trim(), headerRentLine].filter(Boolean).join(" · ");

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
    ? position.currentlyDueGbp
    : data.openBalanceGbp;
  const heroBreakdown = position
    ? activeBalanceHeroBreakdown({
        depositOutstandingGbp: position.depositOutstandingGbp,
        rentOutstandingGbp: position.rentOutstandingGbp,
        extrasOutstandingGbp: position.extraChargesOutstandingGbp,
      })
    : null;
  const nextFutureDue = payments?.summary.nextFutureDue ?? null;

  const extraChargeRows = useMemo(
    () =>
      computeHireExtraChargePaymentTableRowsFromWorkspace({
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
      <header className={embedded ? "hire-balance-page-header hire-balance-page-header-embedded" : "hire-balance-page-header"}>
        {!embedded ? (
          <div className="hire-balance-page-header-top">
            <Link href="/rental/balances" className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
              ← Back to balances
            </Link>
            <div className="hire-balance-page-header-tools-desktop">
              <BalanceHeaderTools hireGroupId={hireGroupId} />
            </div>
          </div>
        ) : (
          <div className="hire-balance-page-header-top">
            <span className="hire-balance-page-badge">Active hire</span>
            <div className="hire-balance-page-header-tools-desktop">
              <HirePaymentStatementDownloadButton
                hireGroupId={hireGroupId}
                variant="default"
                source="balance-account"
              />
            </div>
          </div>
        )}
        {!embedded ? (
          <div className="hire-balance-page-header-meta">
            <span className="hire-balance-page-badge">Active hire</span>
            {data.balanceReference ? (
              <span className="hire-balance-page-reference">{data.balanceReference}</span>
            ) : null}
          </div>
        ) : null}
        <div className="hire-balance-page-header-copy">
          <div className="min-w-0 flex-1">
            <h1 className="hire-balance-page-title">Payments & balance</h1>
            {embedded ? (
              <p className="hire-balance-page-desc">
                Manage rent, extra charges, payments and the running account without leaving this hire.
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        <div className="hire-balance-page-header-tools-mobile">
          {embedded ? (
            <HirePaymentStatementDownloadButton
              hireGroupId={hireGroupId}
              variant="default"
              source="balance-account"
              className="w-full min-w-0 items-stretch"
            />
          ) : (
            <BalanceHeaderTools hireGroupId={hireGroupId} stacked />
          )}
          {tab === "account-statement" && canRecordPayment ? (
            <HireAllocatedPaymentComposer
              hireGroupId={hireGroupId}
              payments={payments}
              submitLabel="Record payment"
              triggerLabel="Record payment"
              triggerClassName="rph-btn-primary h-10 w-full"
              onAllocationChange={handleHighlightedRowIdsChange}
              onSuccess={onReload}
            />
          ) : null}
        </div>
      </header>

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
                  <span className="hire-balance-hero-badge">Payment due</span>
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
                      triggerClassName="hire-balance-hero-cta"
                      onAllocationChange={handleHighlightedRowIdsChange}
                      onSuccess={onReload}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="hire-balance-kpi-grid">
            <div className={`hire-balance-kpi hire-balance-kpi-deposit`}>
              <p className="hire-balance-kpi-label">{depositCard.label}</p>
              <p
                className={`hire-balance-kpi-value${depositCard.paid ? " hire-balance-kpi-value-paid" : ""}`}
              >
                {depositCard.value}
              </p>
              <p className="hire-balance-kpi-hint">{depositCard.hint}</p>
            </div>
            <div className="hire-balance-kpi hire-balance-kpi-rent">
              <p className="hire-balance-kpi-label">Outstanding rent</p>
              <p className="hire-balance-kpi-value">{formatGbp(position.rentOutstandingGbp)}</p>
              <p className="hire-balance-kpi-hint">
                {activeBalanceChargedPaidHint(
                  Math.max(0, payments.summary.totalDueGbp),
                  payments.summary.totalPaidGbp,
                )}
              </p>
            </div>
            <div className="hire-balance-kpi hire-balance-kpi-extras">
              <p className="hire-balance-kpi-label">Outstanding extras</p>
              <p className="hire-balance-kpi-value">{formatGbp(position.extraChargesOutstandingGbp)}</p>
              <p className="hire-balance-kpi-hint">
                {activeBalanceChargedPaidHint(metrics.extraChargesGbp, metrics.extraChargesPaidGbp)}
              </p>
            </div>
            <div className="hire-balance-kpi hire-balance-kpi-next">
              <p className="hire-balance-kpi-label">Next future rent</p>
              <p className="hire-balance-kpi-value">
                {nextFutureDue ? formatGbp(nextFutureDue.amountGbp) : "—"}
              </p>
              <p className="hire-balance-kpi-hint">
                {nextFutureDue
                  ? activeBalanceNextRentDueHint(nextFutureDue.periodStart)
                  : "No future rent scheduled"}
              </p>
            </div>
          </div>

          <div className="hire-balance-detail-grid">
            <section className="hire-balance-panel">
              <div className="hire-balance-panel-head">
                <div>
                  <p className="hire-balance-panel-kicker">Rent to date</p>
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
                  <p className="hire-balance-panel-kicker">Next scheduled</p>
                  <h2 className="hire-balance-panel-title">Future rent payment</h2>
                </div>
                {nextFutureDue ? <span className="hire-balance-status-pill">Not yet owed</span> : null}
              </div>
              {nextFutureDue ? (
                <>
                  <p className="hire-balance-future-date">
                    {formatUkDateTextLong(nextFutureDue.periodStart)}
                  </p>
                  <p className="hire-balance-future-amount">{formatGbp(nextFutureDue.amountGbp)}</p>
                  <p className="hire-balance-future-note">
                    This future period is not included in today&apos;s balance. It will only be charged if the hire
                    remains active.
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
                  <p className="hire-balance-panel-kicker">Additional charge</p>
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
          ) : (
            <section className="hire-balance-panel">
              <div className="hire-balance-panel-head">
                <div>
                  <p className="hire-balance-panel-kicker">Additional charges</p>
                  <h2 className="hire-balance-panel-title">No extra charges</h2>
                </div>
                {canMutateCharges ? (
                  <button type="button" className="hire-balance-panel-link" onClick={switchToExtraCharges}>
                    Add a charge
                  </button>
                ) : (
                  <button type="button" className="hire-balance-panel-link" onClick={switchToExtraCharges}>
                    View charges
                  </button>
                )}
              </div>
              <div className="hire-balance-empty-charges">
                <span className="hire-balance-empty-charges-icon" aria-hidden>
                  ✓
                </span>
                <div className="min-w-0">
                  <p className="hire-balance-empty-charges-title">Nothing additional has been charged.</p>
                  <p className="hire-balance-empty-charges-hint">
                    Damage, administration fees and adjustments will appear here when posted.
                  </p>
                </div>
              </div>
            </section>
          )}
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
          onAllocationChange={handleHighlightedRowIdsChange}
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
          currentlyOwedGbp={openBalanceGbp}
          headerMeta={data.vehicleVrm}
          onReload={onReload}
          onAllocationChange={handleHighlightedRowIdsChange}
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
        headerMeta={
          openBalanceGbp > 0.005
            ? `${data.vehicleVrm} · ${formatGbp(openBalanceGbp)} currently owed`.toUpperCase()
            : data.vehicleVrm?.toUpperCase() ?? null
        }
        paymentAccounts={payments.settlementPaymentAccounts}
        defaultPaymentAccountId={payments.defaultSettlementPaymentAccountId}
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
