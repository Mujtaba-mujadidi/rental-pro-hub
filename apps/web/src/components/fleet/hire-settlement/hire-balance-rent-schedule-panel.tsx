"use client";

import { useMemo, useState } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  balanceRentScheduleCadenceKicker,
  balanceRentScheduleFutureSummary,
  splitBalanceRentScheduleRows,
} from "@/lib/fleet/hire-active-balance-display";
import { buildHireEndedDepositRefundDisplay } from "@/lib/fleet/hire-ended-payments-display";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";

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

  return (
    <section className="hire-balance-rent-schedule">
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
              onAllocationChange={onAllocationChange}
              onSuccess={onReload}
              busy={pending}
            />
          </div>
        ) : null}
      </header>

      <HirePaymentScheduleTable
        rows={primaryRows}
        canRecordOnRow={payments.canSubmitPayment}
        canApprove={payments.canApprovePayments}
        canApplyDiscount={payments.canApplyDiscount}
        highlightedRowIds={highlightedRowIds}
        contractEndedYmd={payments.contractEndedYmd}
        settlementSettled={payments.settlementBalance?.settled === true}
        refundMarkByRowId={displayOptions.refundMarkByRowId}
        audience="staff"
        readOnly={payments.scheduleReadOnly}
        variant="balance"
        onRefresh={onReload}
      />

      {futureRows.length > 0 ? (
        <div className="hire-balance-rent-schedule-future">
          <button
            type="button"
            className="hire-balance-rent-schedule-future-toggle"
            aria-expanded={futureOpen}
            onClick={() => setFutureOpen((open) => !open)}
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
              <HirePaymentScheduleTable
                rows={futureRows}
                canRecordOnRow={payments.canSubmitPayment}
                canApprove={payments.canApprovePayments}
                canApplyDiscount={payments.canApplyDiscount}
                highlightedRowIds={highlightedRowIds}
                contractEndedYmd={payments.contractEndedYmd}
                settlementSettled={payments.settlementBalance?.settled === true}
                refundMarkByRowId={displayOptions.refundMarkByRowId}
                audience="staff"
                readOnly={payments.scheduleReadOnly}
                variant="balance"
                onRefresh={onReload}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
