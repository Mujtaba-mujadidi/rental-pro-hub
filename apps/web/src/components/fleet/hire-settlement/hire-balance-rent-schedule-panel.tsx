"use client";

import { useMemo, useState } from "react";
import type { HirePaymentPageRow, HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import {
  balanceRentScheduleCadenceKicker,
  balanceRentScheduleFutureSummary,
  balanceRentSchedulePeriodLabel,
  splitBalanceRentScheduleRows,
} from "@/lib/fleet/hire-active-balance-display";
import { buildHireEndedDepositRefundDisplay } from "@/lib/fleet/hire-ended-payments-display";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";
import {
  deriveHirePaymentDisplayStatus,
  HIRE_PAYMENT_DISPLAY_STATUSES,
  hirePaymentDisplayStatusMeta,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";

type FutureStatusFilter = "all" | HirePaymentDisplayStatus;

function matchesFutureSearch(row: HirePaymentPageRow, term: string, todayYmd: string): boolean {
  if (!term) return true;
  const displayStatus = deriveHirePaymentDisplayStatus(row, todayYmd);
  const statusMeta = hirePaymentDisplayStatusMeta(displayStatus, { audience: "staff" });
  const hay = [
    balanceRentSchedulePeriodLabel(row),
    formatUkDate(row.periodStart),
    formatUkDate(row.periodEnd),
    row.rowKind,
    row.paymentStatus,
    displayStatus,
    statusMeta.label,
    row.baseAmountGbp,
    row.discountTotalGbp,
    row.netDueGbp,
    row.paidGbp,
    row.balanceGbp,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(term);
}

export function HireBalanceRentSchedulePanel({
  hireGroupId,
  payments,
  rentCadence,
  highlightedRowIds,
  canRecordPayment,
  pending,
  onReload,
  onAllocationChange,
}: {
  hireGroupId: string;
  payments: HirePaymentsPageData;
  rentCadence: string | null;
  highlightedRowIds: string[];
  canRecordPayment: boolean;
  pending: boolean;
  onReload: () => void;
  onAllocationChange: (rowIds: string[]) => void;
}) {
  const [futureOpen, setFutureOpen] = useState(false);
  const [futureSearch, setFutureSearch] = useState("");
  const [futureStatusFilter, setFutureStatusFilter] = useState<FutureStatusFilter>("all");
  const todayYmd = ukTodayYmd();

  const displayOptions = useMemo(() => {
    const depositRefund = buildHireEndedDepositRefundDisplay({ payments });
    return {
      contractEndedYmd: payments.contractEndedYmd,
      settlementSettled: payments.settlementBalance?.settled === true,
      audience: "staff" as const,
      refundMarkByRowId: buildHireScheduleRefundMarksByRowId(payments.rows, payments.contractEndedYmd, {
        prepaidRentRefundedGbp: depositRefund?.advanceRentRefundedGbp ?? 0,
        depositRefundedGbp: depositRefund?.depositRefundedGbp ?? 0,
      }),
    };
  }, [payments]);

  const { primaryRows, futureRows } = useMemo(
    () => splitBalanceRentScheduleRows(payments.rows, todayYmd, displayOptions),
    [displayOptions, payments.rows, todayYmd],
  );
  const futureSummary = balanceRentScheduleFutureSummary(futureRows, rentCadence);

  const filteredFutureRows = useMemo(() => {
    const term = futureSearch.trim().toLowerCase();
    return futureRows
      .filter((row) => {
        if (futureStatusFilter === "all") return true;
        return deriveHirePaymentDisplayStatus(row, todayYmd, displayOptions) === futureStatusFilter;
      })
      .filter((row) => matchesFutureSearch(row, term, todayYmd));
  }, [displayOptions, futureRows, futureSearch, futureStatusFilter, todayYmd]);

  const futureStatusOptions = useMemo(
    () => [
      { value: "all" as const, label: "All statuses" },
      ...HIRE_PAYMENT_DISPLAY_STATUSES.map((status) => ({
        value: status,
        label: hirePaymentDisplayStatusMeta(status, { audience: "staff" }).label,
      })),
    ],
    [],
  );

  const sharedTableProps = {
    canRecordOnRow: payments.canSubmitPayment,
    canApprove: payments.canApprovePayments,
    canApplyDiscount: payments.canApplyDiscount,
    highlightedRowIds,
    contractEndedYmd: payments.contractEndedYmd,
    settlementSettled: payments.settlementBalance?.settled === true,
    refundMarkByRowId: displayOptions.refundMarkByRowId,
    audience: "staff" as const,
    readOnly: payments.scheduleReadOnly,
    variant: "balance" as const,
    showFilters: false as const,
    onRefresh: onReload,
  };

  return (
    <div className="hire-balance-rent-schedule-stack">
      <section className="hire-balance-rent-schedule-card">
        <header className="hire-balance-rent-schedule-header">
          <div className="min-w-0">
            <p className="driver-dash-section-label">{balanceRentScheduleCadenceKicker(rentCadence)}</p>
            <h2 className="hire-balance-rent-schedule-title">Rent schedule</h2>
            <p className="hire-balance-rent-schedule-desc">
              Paid, overdue and future rent periods in one place.
            </p>
          </div>
          {canRecordPayment ? (
            <div className="flex flex-wrap items-center gap-2">
              <HireAllocatedPaymentComposer
                hireGroupId={hireGroupId}
                payments={payments}
                submitLabel="Record payment"
                triggerLabel="Record payment"
                triggerClassName="hire-balance-rent-schedule-record-btn"
                onAllocationChange={onAllocationChange}
                onSuccess={onReload}
                busy={pending}
              />
            </div>
          ) : null}
        </header>

        <HirePaymentScheduleTable rows={primaryRows} {...sharedTableProps} />
      </section>

      {futureRows.length > 0 ? (
        <section className="hire-balance-rent-schedule-card hire-balance-rent-schedule-future-card">
          <button
            type="button"
            className="hire-balance-rent-schedule-future-toggle"
            aria-expanded={futureOpen}
            onClick={() => {
              setFutureOpen((open) => {
                if (open) {
                  setFutureSearch("");
                  setFutureStatusFilter("all");
                }
                return !open;
              });
            }}
          >
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-rph-fg">Future contract schedule</span>
              <span className="mt-0.5 block text-xs text-rph-fg-secondary">{futureSummary}</span>
            </span>
            <span className="hire-balance-rent-schedule-future-link">
              {futureOpen ? "Hide schedule" : "Show schedule"}
            </span>
          </button>

          {futureOpen ? (
            <div className="hire-balance-rent-schedule-future-body">
              <div className="hire-balance-rent-schedule-future-filters">
                <label className="min-w-[12rem] flex-1 space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">Search</span>
                  <input
                    className="rph-input w-full"
                    placeholder="Period, status, amount…"
                    value={futureSearch}
                    onChange={(e) => setFutureSearch(e.target.value)}
                  />
                </label>
                <div className="min-w-[11rem] space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">Status</span>
                  <RphSelect
                    value={futureStatusFilter}
                    aria-label="Filter future schedule by status"
                    options={futureStatusOptions}
                    onValueChange={(v) => setFutureStatusFilter(v as FutureStatusFilter)}
                  />
                </div>
              </div>
              <HirePaymentScheduleTable rows={filteredFutureRows} {...sharedTableProps} />
            </div>
          ) : (
            <p className="hire-balance-rent-schedule-future-footnote">
              The remaining annual schedule is available for audit and planning. It stays collapsed
              during day-to-day payment work.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
