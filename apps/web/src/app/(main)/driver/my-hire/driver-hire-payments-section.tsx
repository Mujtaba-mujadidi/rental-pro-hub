"use client";

import {
  loadDriverHirePaymentsPageAction,
  submitDriverHirePaymentAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHirePaymentsSection({ hireGroupId }: { hireGroupId: string }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HirePaymentsPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHirePaymentsPageAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
    });
  }, [hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useHirePaymentsRealtime(hireGroupId, reload);

  if (!data && pending) {
    return <p className="rph-muted text-sm" role="status">Loading payments…</p>;
  }
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.canSubmitPayment ? (
        <div className="flex justify-end">
          <HirePaymentComposer
            hireGroupId={hireGroupId}
            scheduleBalanceGbp={data.summary.scheduleBalanceGbp}
            balanceToDateGbp={data.summary.balanceGbp}
            paymentAccount={data.paymentAccount}
            canSubmit={data.canSubmitPayment}
            triggerLabel="Submit payment"
            submitLabel="Submit payment"
            asDriver
            onAllocationChange={setHighlightedRowIds}
            onSuccess={reload}
            onSubmit={async (input) => {
              const res = await submitDriverHirePaymentAction({
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
      <HirePaymentScheduleTable
        rows={data.rows}
        canRecordOnRow={false}
        canApprove={false}
        canApplyDiscount={false}
        highlightedRowIds={highlightedRowIds}
        onRefresh={reload}
      />
    </div>
  );
}
