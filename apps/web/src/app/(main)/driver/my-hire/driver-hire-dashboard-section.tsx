"use client";

import { loadDriverHireDashboardAction, type HireDashboardData } from "@/app/actions/hire-dashboard";
import {
  loadDriverHireCheckoutGlanceAction,
  type HireCheckoutGlanceData,
} from "@/app/actions/hire-inspections";
import {
  loadDriverHirePaymentsPageAction,
  type HirePaymentPageRow,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveDriverSummary } from "@/components/fleet/hire-summary/hire-active-driver-summary";
import { HireEndedDriverSummary } from "@/components/fleet/hire-summary/hire-ended-driver-summary";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHireDashboardSection({
  hireGroupId,
  hireStatus,
}: {
  hireGroupId: string;
  hireStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [paymentRows, setPaymentRows] = useState<readonly HirePaymentPageRow[]>([]);
  const [payments, setPayments] = useState<HirePaymentsPageData | null>(null);
  const [checkout, setCheckout] = useState<HireCheckoutGlanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaceBase = `/driver/hires/${hireGroupId}`;

  const reload = useCallback(() => {
    startTransition(async () => {
      const [dashboardRes, paymentsRes, checkoutRes] = await Promise.all([
        loadDriverHireDashboardAction(hireGroupId),
        loadDriverHirePaymentsPageAction(hireGroupId),
        loadDriverHireCheckoutGlanceAction(hireGroupId),
      ]);
      if (!dashboardRes.ok) {
        setError(dashboardRes.error);
        setData(null);
        setPaymentRows([]);
        setPayments(null);
        setCheckout(null);
        return;
      }
      if (!paymentsRes.ok) {
        setError(paymentsRes.error);
        setData(null);
        setPaymentRows([]);
        setPayments(null);
        setCheckout(null);
        return;
      }
      setData(dashboardRes.data);
      setPaymentRows(paymentsRes.data.rows);
      setPayments(paymentsRes.data);
      setCheckout(checkoutRes.ok ? checkoutRes.data : null);
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

  const contractEnded = data.overview.contractEnded;

  if (!contractEnded) {
    return (
      <HireActiveDriverSummary
        data={data}
        context={data.overview}
        paymentRows={paymentRows}
        checkout={checkout}
        hireStatus={hireStatus}
        paymentsHref={driverHireWorkspaceHref(hireGroupId, "payments")}
        detailsHref={driverHireWorkspaceHref(hireGroupId, "details")}
        workspaceBase={workspaceBase}
      />
    );
  }

  if (!payments) return null;

  return (
    <HireEndedDriverSummary
      data={data}
      context={data.overview}
      payments={payments}
      checkout={checkout}
      workspaceBase={workspaceBase}
      paymentsHref={driverHireWorkspaceHref(hireGroupId, "payments")}
      detailsHref={driverHireWorkspaceHref(hireGroupId, "details")}
    />
  );
}
