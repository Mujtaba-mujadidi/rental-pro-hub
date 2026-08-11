"use client";

import {
  loadDriverHirePaymentsPageAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveDriverPaymentsView } from "@/components/fleet/hire-payments/hire-active-driver-payments-view";
import { HireEndedDriverPaymentsView } from "@/components/fleet/hire-payments/hire-ended-driver-payments-view";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHirePaymentsSection({
  hireGroupId,
  chrome,
}: {
  hireGroupId: string;
  chrome?: HireWorkspaceChromeData;
}) {
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

  if (!contractEnded && chrome) {
    return (
      <HireActiveDriverPaymentsView
        hireGroupId={hireGroupId}
        data={data}
        chrome={chrome}
        highlightedRowIds={highlightedRowIds}
        onHighlightedRowIdsChange={setHighlightedRowIds}
        onReload={reload}
        busy={pending}
      />
    );
  }

  if (contractEnded) {
    return (
      <HireEndedDriverPaymentsView hireGroupId={hireGroupId} data={data} onReload={reload} />
    );
  }

  // Active hire without chrome (rare): keep a minimal loading-safe fallback.
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">Loading payments…</p>
    </div>
  );
}
