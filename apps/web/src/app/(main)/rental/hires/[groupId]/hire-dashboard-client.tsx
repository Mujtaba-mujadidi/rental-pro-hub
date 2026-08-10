"use client";

import {
  loadHireDashboardAction,
  type HireDashboardData,
} from "@/app/actions/hire-dashboard";
import {
  loadHireEndedInspectionAttentionAction,
  type HireEndedInspectionAttentionData,
} from "@/app/actions/hire-inspections";
import {
  loadHirePaymentsPageAction,
  type HirePaymentPageRow,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveCompanySummary } from "@/components/fleet/hire-summary/hire-active-company-summary";
import { HireEndedCompanySummary } from "@/components/fleet/hire-summary/hire-ended-company-summary";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireDashboardClient() {
  const { shell, chrome } = useHireWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [payments, setPayments] = useState<HirePaymentsPageData | null>(null);
  const [paymentRows, setPaymentRows] = useState<readonly HirePaymentPageRow[]>([]);
  const [inspectionAttention, setInspectionAttention] = useState<HireEndedInspectionAttentionData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const base = `/rental/hires/${shell.hireGroupId}`;

  const reload = useCallback(() => {
    startTransition(async () => {
      const [dashboardRes, paymentsRes] = await Promise.all([
        loadHireDashboardAction(shell.hireGroupId),
        loadHirePaymentsPageAction(shell.hireGroupId),
      ]);
      if (!dashboardRes.ok) {
        setError(dashboardRes.error);
        setData(null);
        setPayments(null);
        setPaymentRows([]);
        setInspectionAttention(null);
        return;
      }
      if (!paymentsRes.ok) {
        setError(paymentsRes.error);
        setData(null);
        setPayments(null);
        setPaymentRows([]);
        setInspectionAttention(null);
        return;
      }

      let inspectionRes: Awaited<ReturnType<typeof loadHireEndedInspectionAttentionAction>> | null = null;
      if (dashboardRes.data.overview.contractEnded) {
        inspectionRes = await loadHireEndedInspectionAttentionAction(shell.hireGroupId);
      }

      setData(dashboardRes.data);
      setPayments(paymentsRes.data);
      setPaymentRows(paymentsRes.data.rows);
      setInspectionAttention(inspectionRes?.ok ? inspectionRes.data : { items: [], checkinCompleted: false });
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
        <p className="text-sm text-rph-fg-secondary">Loading summary…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data || !payments) return null;

  const contractEnded = data.overview.contractEnded;

  if (!contractEnded) {
    return (
      <HireActiveCompanySummary
        data={data}
        context={data.overview}
        chrome={chrome}
        paymentRows={paymentRows}
        paymentsHref={`${base}/payments`}
        detailsHref={`${base}/details`}
        onRecordPayment={
          shell.canManagePayments || shell.canApprovePayments
            ? () => router.push(`${base}/payments`)
            : undefined
        }
      />
    );
  }

  return (
    <HireEndedCompanySummary
      data={data}
      context={data.overview}
      payments={payments}
      inspectionItems={inspectionAttention?.items ?? []}
      paymentsHref={`${base}/payments`}
      detailsHref={`${base}/details`}
      inspectionsHref={`${base}/checkout`}
    />
  );
}
