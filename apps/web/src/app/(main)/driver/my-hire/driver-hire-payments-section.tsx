"use client";

import {
  loadDriverHirePaymentsPageAction,
  submitDriverHirePaymentAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireEndedContractScheduleBanner } from "@/components/fleet/hire-payments/hire-ended-contract-schedule-banner";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import { HirePaymentSummaryCards } from "@/components/fleet/hire-payments/hire-payment-summary-cards";
import { HireSettlementBalancePaymentsTable } from "@/components/fleet/hire-payments/hire-settlement-balance-payments-table";
import { HireTerminationSummaryCard } from "@/components/fleet/hire-payments/hire-termination-summary-card";
import { HirePaymentsAccountOverview } from "@/components/fleet/hire-payments/hire-payments-account-overview";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireWorkspaceBalanceBanner } from "@/components/fleet/hire-dashboard/hire-workspace-balance-banner";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";
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

  const contractEnded = Boolean(data.contractEndedYmd);
  const ledgerSummary =
    data.settlementBalancePayments.length > 0
      ? summarizeHireSettlementLedger(data.settlementBalancePayments)
      : null;

  return (
    <div className="space-y-6">
      <HirePaymentsAccountOverview
        contractEnded={contractEnded}
        contractEndedAtLabel={data.contractEndedAtLabel}
        summary={data.summary}
        terminationSummary={data.terminationSummary}
        settlementBalance={data.settlementBalance}
        depositPendingReview={data.depositPendingReview}
        depositGbp={data.depositGbp ?? 0}
        depositDispositionLabel={data.depositDispositionLabel}
        ledgerSummary={ledgerSummary}
      />

      {!contractEnded ? (
        <>
          <HirePaymentSummaryCards
            summary={data.summary}
            compact
            contractEnded={contractEnded}
          />
          <HireWorkspaceBalanceBanner
            hireGroupId={hireGroupId}
            rentBalanceGbp={data.summary.balanceGbp}
            rentCreditGbp={data.summary.creditGbp}
            settlementBalance={data.settlementBalance}
            audience="driver"
            contractEnded={contractEnded}
            depositPendingReview={data.depositPendingReview}
            depositGbp={data.depositGbp ?? 0}
            depositDispositionLabel={data.depositDispositionLabel}
          />
        </>
      ) : null}

      <HireDepositPendingBanner
        hireGroupId={hireGroupId}
        closure={{
          depositPendingReview: data.depositPendingReview,
          depositGbp: data.depositGbp ?? 0,
          rentSettlementSettled: data.settlementBalance?.settled === true,
        }}
        audience="driver"
      />

      <HireSettlementBalancePaymentsTable
        payments={data.settlementBalancePayments}
        contractEnded={contractEnded}
      />

      {data.terminationSummary ? (
        <HireTerminationSummaryCard
          summary={data.terminationSummary}
          depositDispositionLabel={data.depositDispositionLabel}
          settlementResolutionLabel={data.settlementResolutionLabel}
        />
      ) : null}

      {data.contractEndedAtLabel ? (
        <HireEndedContractScheduleBanner
          contractEndedAtLabel={data.contractEndedAtLabel}
          hasPostEndPrepaidPayments={data.hasPostEndPrepaidPayments}
          settlementSettled={data.settlementBalance?.settled === true}
        />
      ) : null}

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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-rph-fg">
            {contractEnded ? "Rent during contract" : "Payment schedule"}
          </h2>
        </div>
        {contractEnded ? (
          <HirePaymentSummaryCards summary={data.summary} compact contractEnded endedContractOnly />
        ) : null}
        <HirePaymentScheduleTable
          rows={data.rows}
          canRecordOnRow={false}
          canApprove={false}
          canApplyDiscount={false}
          highlightedRowIds={highlightedRowIds}
          contractEndedYmd={data.contractEndedYmd}
          settlementSettled={data.settlementBalance?.settled === true}
          audience="driver"
          readOnly={data.scheduleReadOnly}
          onRefresh={reload}
        />
      </section>
    </div>
  );
}
