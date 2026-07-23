"use client";

import {
  loadHirePaymentsPageAction,
  submitStaffHirePaymentAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HirePaymentSummaryCards } from "@/components/fleet/hire-payments/hire-payment-summary-cards";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";

export function HirePaymentsView({
  hireGroupId,
  onDataChange,
}: {
  hireGroupId: string;
  onDataChange?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HirePaymentsPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadHirePaymentsPageAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
      await onDataChange?.();
    });
  }, [hireGroupId, onDataChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  useHirePaymentsRealtime(hireGroupId, reload);

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading payments…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="rph-h1">Payments</h1>
          <p className="rph-muted mt-1 text-sm">
            Record and approve rent payments for this hire. Total due is calculated to date, not the full
            contract.
          </p>
        </div>
        {data.canSubmitPayment ? (
          <div className="shrink-0 self-start">
            <HirePaymentComposer
              hireGroupId={hireGroupId}
              scheduleBalanceGbp={data.summary.scheduleBalanceGbp}
              balanceToDateGbp={data.summary.balanceGbp}
              paymentAccount={data.paymentAccount}
              canSubmit
              submitLabel="Record payment"
              onAllocationChange={setHighlightedRowIds}
              onSuccess={reload}
              onSubmit={async (input) => {
                const res = await submitStaffHirePaymentAction({
                  hireGroupId,
                  amountGbp: input.amountGbp,
                  paymentReference: input.paymentReference,
                });
                if (res.ok) reload();
                return res;
              }}
              busy={pending}
            />
          </div>
        ) : null}
      </div>

      <HirePaymentSummaryCards summary={data.summary} showDiscountTotal compact />

      <HirePaymentScheduleTable
        rows={data.rows}
        canRecordOnRow={data.canSubmitPayment}
        canApprove={data.canApprovePayments}
        canApplyDiscount={data.canApplyDiscount}
        highlightedRowIds={highlightedRowIds}
        onRefresh={reload}
      />
    </div>
  );
}
