"use client";

import { loadHireDashboardAction, type HireDashboardData } from "@/app/actions/hire-dashboard";
import { HireTerminateContractModal } from "@/components/fleet/hire-termination/hire-terminate-contract-modal";
import { HireOverviewView } from "@/components/fleet/hire-overview/hire-overview-view";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireDashboardClient() {
  const { shell } = useHireWorkspace();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminateOpen, setTerminateOpen] = useState(false);

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
        <p className="text-sm text-rph-fg-secondary">Loading overview…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return (
    <>
      <HireOverviewView
        data={data}
        context={data.overview}
        audience="staff"
        paymentsHref={`${base}/payments`}
        headerActions={
          <>
            {shell.status === "reserved" ? (
              <Link href={`${base}/checkout`} className="rph-btn-primary">
                Vehicle checkout
              </Link>
            ) : null}
            {data.canTerminate ? (
              <button type="button" className="rph-btn-primary" onClick={() => setTerminateOpen(true)}>
                End contract
              </button>
            ) : null}
            {shell.status === "terminated" ? (
              <Link href={`${base}/checkin`} className="rph-btn-primary">
                Vehicle check-in
              </Link>
            ) : null}
          </>
        }
      />

      <HireTerminateContractModal
        hireGroupId={shell.hireGroupId}
        open={terminateOpen}
        includeDeposit={data.includeDeposit}
        onClose={() => setTerminateOpen(false)}
        onCompleted={reload}
      />
    </>
  );
}
