"use client";

import { loadDriverHireDashboardAction, type HireDashboardData } from "@/app/actions/hire-dashboard";
import { HireDashboardAttentionList } from "@/components/fleet/hire-dashboard/hire-dashboard-attention-list";
import { HireDashboardDriverLifecycleCards } from "@/components/fleet/hire-dashboard/hire-dashboard-driver-lifecycle-cards";
import { HireDashboardPaymentChart } from "@/components/fleet/hire-dashboard/hire-dashboard-payment-chart";
import { HireDashboardPaymentHealth } from "@/components/fleet/hire-dashboard/hire-dashboard-payment-health";
import { HireDashboardRecentActivity } from "@/components/fleet/hire-dashboard/hire-dashboard-recent-activity";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { HireWorkspaceBalanceBanner } from "@/components/fleet/hire-dashboard/hire-workspace-balance-banner";
import { HireEndedContractScheduleBanner } from "@/components/fleet/hire-payments/hire-ended-contract-schedule-banner";
import { HireLifecycleAttentionList } from "@/components/fleet/hire-dashboard/hire-lifecycle-attention-list";
import { HirePaymentSummaryCards } from "@/components/fleet/hire-payments/hire-payment-summary-cards";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHireDashboardSection({
  hireGroupId,
  hireStatusLabel,
  startDateLabel,
  rentLabel,
  onOpenPayments,
}: {
  hireGroupId: string;
  hireStatusLabel: string;
  startDateLabel: string;
  rentLabel: string | null;
  onOpenPayments?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHireDashboardAction(hireGroupId);
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
    return <p className="rph-muted text-sm" role="status">Loading overview…</p>;
  }
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <HireDashboardPaymentHealth
        health={data.health}
        balanceGbp={data.summary.balanceGbp}
        audience="driver"
      />

      <HireWorkspaceBalanceBanner
        hireGroupId={hireGroupId}
        rentBalanceGbp={data.summary.balanceGbp}
        rentCreditGbp={data.summary.creditGbp}
        settlementBalance={data.settlementBalance}
        audience="driver"
        contractEnded={Boolean(data.contractEndedYmd)}
        depositPendingReview={data.depositPendingReview}
        depositGbp={data.depositGbp ?? 0}
        depositDispositionLabel={data.depositDispositionLabel}
        scheduleDepositStatusLabel={data.lifecycle.depositStatusLabel}
      />

      <HireDepositPendingBanner
        hireGroupId={hireGroupId}
        closure={data.financialClosure}
        audience="driver"
      />

      {data.contractEndedAtLabel ? (
        <HireEndedContractScheduleBanner
          contractEndedAtLabel={data.contractEndedAtLabel}
          hasPostEndPrepaidPayments={data.hasPostEndPrepaidPayments}
          settlementSettled={data.settlementBalance?.settled === true}
        />
      ) : null}

      <HireDashboardDriverLifecycleCards
        lifecycle={data.lifecycle}
        hireStatusLabel={hireStatusLabel}
        startDateLabel={startDateLabel}
        rentLabel={rentLabel}
        nextDue={data.summary.nextDue}
        contractEnded={Boolean(data.contractEndedYmd)}
      />

      <HirePaymentSummaryCards
        summary={data.summary}
        compact
        contractEnded={Boolean(data.contractEndedYmd)}
      />

      <HireLifecycleAttentionList items={data.lifecycleAttentionItems} />

      <HireDashboardAttentionList
        items={data.attentionItems}
        paymentsLabel="Open payments"
        onOpenPayments={onOpenPayments}
      />

      <HireDashboardPaymentChart points={data.chartPoints} />

      <HireDashboardRecentActivity
        events={data.recentEvents}
        title="Recent payment activity"
      />
    </div>
  );
}
