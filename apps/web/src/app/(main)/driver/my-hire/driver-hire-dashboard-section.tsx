"use client";

import { loadDriverHireDashboardAction, type HireDashboardData } from "@/app/actions/hire-dashboard";
import { HireOverviewView } from "@/components/fleet/hire-overview/hire-overview-view";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHireDashboardSection({ hireGroupId }: { hireGroupId: string }) {
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
    <HireOverviewView
      data={data}
      context={data.overview}
      audience="driver"
      paymentsHref={driverHireWorkspaceHref(hireGroupId, "payments")}
    />
  );
}
