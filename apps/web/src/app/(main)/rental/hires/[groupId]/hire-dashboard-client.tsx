"use client";

import {
  loadHireDashboardAction,
  type HireDashboardData,
} from "@/app/actions/hire-dashboard";
import {
  loadHirePaymentsPageAction,
  type HirePaymentPageRow,
} from "@/app/actions/hire-payments";
import { HireActiveCompanySummary } from "@/components/fleet/hire-summary/hire-active-company-summary";
import { HireOverviewView } from "@/components/fleet/hire-overview/hire-overview-view";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireDashboardClient() {
  const { shell, chrome } = useHireWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [paymentRows, setPaymentRows] = useState<readonly HirePaymentPageRow[]>([]);
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
        setPaymentRows([]);
        return;
      }
      if (!paymentsRes.ok) {
        setError(paymentsRes.error);
        setData(null);
        setPaymentRows([]);
        return;
      }
      setData(dashboardRes.data);
      setPaymentRows(paymentsRes.data.rows);
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
  if (!data) return null;

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
    <HireOverviewView
      data={data}
      context={data.overview}
      audience="staff"
      paymentsHref={`${base}/payments`}
      headerActions={
        shell.status === "terminated" ? (
          <Link href={`${base}/checkin`} className="rph-btn-primary">
            Vehicle check-in
          </Link>
        ) : null
      }
    />
  );
}
