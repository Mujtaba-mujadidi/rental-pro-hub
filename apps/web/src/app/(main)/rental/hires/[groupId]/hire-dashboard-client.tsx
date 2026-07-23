"use client";

import { loadHireDashboardAction, type HireDashboardData } from "@/app/actions/hire-dashboard";
import { HireDashboardAttentionList } from "@/components/fleet/hire-dashboard/hire-dashboard-attention-list";
import { HireDashboardLifecycleCards } from "@/components/fleet/hire-dashboard/hire-dashboard-lifecycle-cards";
import { HireDashboardPaymentChart } from "@/components/fleet/hire-dashboard/hire-dashboard-payment-chart";
import { HireDashboardPaymentHealth } from "@/components/fleet/hire-dashboard/hire-dashboard-payment-health";
import { HireDashboardRecentActivity } from "@/components/fleet/hire-dashboard/hire-dashboard-recent-activity";
import { HirePaymentSummaryCards } from "@/components/fleet/hire-payments/hire-payment-summary-cards";
import { formatUkDate } from "@/lib/datetime/uk";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireDashboardClient() {
  const { shell } = useHireWorkspace();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/rental/hires/${shell.hireGroupId}`;

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadHireDashboardAction(shell.hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
    });
  }, [shell.hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useHirePaymentsRealtime(shell.hireGroupId, reload);

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading dashboard…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="rph-h1">Hire overview</h1>
          <p className="rph-muted mt-1 text-sm">
            {shell.vehicleVrm} · {shell.vehicleLabel}
            {shell.driverLabel ? ` · ${shell.driverLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/payments`} className="rph-btn-primary">
            Payments
          </Link>
          <Link href={`${base}/details`} className="rph-btn-ghost">
            Details
          </Link>
        </div>
      </div>

      <HireDashboardPaymentHealth health={data.health} balanceGbp={data.summary.balanceGbp} />

      <HireDashboardLifecycleCards
        lifecycle={data.lifecycle}
        hireStatusLabel={shell.statusLabel}
        startDateLabel={formatUkDate(shell.startDate)}
        rentLabel={shell.rentLabel}
      />

      <HirePaymentSummaryCards summary={data.summary} showDiscountTotal compact />

      <HireDashboardAttentionList items={data.attentionItems} paymentsHref={`${base}/payments`} />

      <HireDashboardPaymentChart points={data.chartPoints} />

      <HireDashboardRecentActivity events={data.recentEvents} activityHref={`${base}/activity`} />
    </div>
  );
}
