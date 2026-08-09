"use client";

import {
  loadHirePaymentsPageAction,
  submitStaffHirePaymentAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import { HirePaymentScheduleTable } from "@/components/fleet/hire-payments/hire-payment-schedule-table";
import { HirePaymentSummaryCards } from "@/components/fleet/hire-payments/hire-payment-summary-cards";
import { HireEndedContractScheduleBanner } from "@/components/fleet/hire-payments/hire-ended-contract-schedule-banner";
import { HireDepositDispositionResolveCard } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HireSettlementBalancePaymentCard } from "@/components/fleet/hire-payments/hire-settlement-balance-payment-card";
import { HireSettlementBalancePaymentsTable } from "@/components/fleet/hire-payments/hire-settlement-balance-payments-table";
import { HireTerminationSummaryCard } from "@/components/fleet/hire-payments/hire-termination-summary-card";
import { HirePaymentsAccountOverview } from "@/components/fleet/hire-payments/hire-payments-account-overview";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireWorkspaceBalanceBanner } from "@/components/fleet/hire-dashboard/hire-workspace-balance-banner";
import { HireSettlementBreakdownPanel } from "@/components/fleet/hire-settlement/hire-settlement-breakdown-panel";
import { HireDriverChargesTable } from "@/components/fleet/hire-payments/hire-driver-charges-table";
import { summarizeHireSettlementLedger } from "@/lib/fleet/hire-payments-ledger";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { RphPageHeader } from "@/components/ui/rph-toolbar";
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

  const contractEnded = Boolean(data.contractEndedYmd);
  const ledgerSummary =
    data.settlementBalancePayments.length > 0
      ? summarizeHireSettlementLedger(data.settlementBalancePayments)
      : null;

  return (
    <div className="space-y-6">
      <RphPageHeader
        title="Payments"
        description={
          contractEnded
            ? "This hire has ended. See the summary, money in/out, and rent for the contract below."
            : "Record and approve rent payments for this hire. Totals are for weeks started so far, not the full contract."
        }
        actions={
          !contractEnded && data.canSubmitPayment ? (
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
          ) : null
        }
      />

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
        driverChargeLineItems={data.driverChargeLineItems}
      />

      {data.settlementBreakdown ? (
        <HireSettlementBreakdownPanel breakdown={data.settlementBreakdown} />
      ) : null}

      {data.driverChargeLineItems.length > 0 ? (
        <HireDriverChargesTable items={data.driverChargeLineItems} />
      ) : null}

      {!contractEnded ? (
        <HireWorkspaceBalanceBanner
          hireGroupId={hireGroupId}
          rentBalanceGbp={data.summary.balanceGbp}
          rentCreditGbp={data.summary.creditGbp}
          settlementBalance={data.settlementBalance}
          contractEnded={contractEnded}
          depositPendingReview={data.depositPendingReview}
          depositGbp={data.depositGbp ?? 0}
          depositDispositionLabel={data.depositDispositionLabel}
        />
      ) : null}

      <HireDepositPendingBanner
        hireGroupId={hireGroupId}
        closure={{
          depositPendingReview: data.depositPendingReview,
          depositGbp: data.depositGbp ?? 0,
          rentSettlementSettled: data.settlementBalance?.settled === true,
        }}
      />

      {data.depositPendingReview && data.terminationSummary && data.depositGbp != null && data.depositGbp > 0 ? (
        <HireDepositDispositionResolveCard
          hireGroupId={hireGroupId}
          terminationSummary={data.terminationSummary}
          currentSignedSettlementGbp={data.currentSignedSettlementGbp}
          onSuccess={reload}
        />
      ) : null}

      {data.canRecordSettlementPayment && data.settlementBalance && !data.settlementBalance.settled ? (
        <HireSettlementBalancePaymentCard
          hireGroupId={hireGroupId}
          settlementBalance={data.settlementBalance}
          paymentAccounts={data.settlementPaymentAccounts}
          defaultPaymentAccountId={data.defaultSettlementPaymentAccountId}
          onSuccess={reload}
        />
      ) : null}

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
          driverDocumentsRetainUntilLabel={data.driverDocumentsRetainUntilLabel}
          driverDocumentsRetentionWarning={data.driverDocumentsRetentionWarning}
          showDocumentRetention
        />
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-rph-fg">
            {contractEnded ? "Rent during contract" : "Payment schedule"}
          </h2>
          <p className="rph-muted mt-1 text-xs">
            {contractEnded
              ? "Deposit is listed first, then rent weeks. Weeks after the end date are hidden unless the driver paid early."
              : "Deposit is listed first, then rent weeks. Only weeks that have started count toward the balance above."}
          </p>
        </div>

        {!contractEnded ? (
          <HirePaymentSummaryCards
            summary={data.summary}
            showDiscountTotal
            compact
            contractEnded={contractEnded}
          />
        ) : (
          <HirePaymentSummaryCards
            summary={data.summary}
            compact
            contractEnded={contractEnded}
            endedContractOnly
          />
        )}

        <HirePaymentScheduleTable
          rows={data.rows}
          canRecordOnRow={data.canSubmitPayment}
          canApprove={data.canApprovePayments}
          canApplyDiscount={data.canApplyDiscount}
          highlightedRowIds={highlightedRowIds}
          contractEndedYmd={data.contractEndedYmd}
          settlementSettled={data.settlementBalance?.settled === true}
          audience="staff"
          readOnly={data.scheduleReadOnly}
          onRefresh={reload}
        />
      </section>
    </div>
  );
}
