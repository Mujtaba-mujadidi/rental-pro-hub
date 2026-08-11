"use client";

import {
  loadHirePaymentsPageAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveCompanyPaymentsView } from "@/components/fleet/hire-payments/hire-active-company-payments-view";
import { HireEndedCompanyPaymentsView } from "@/components/fleet/hire-payments/hire-ended-company-payments-view";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import { useHireWorkspace } from "@/app/(main)/rental/hires/[groupId]/hire-workspace-provider";
import { useCallback, useEffect, useState, useTransition } from "react";

export function HirePaymentsView({
  hireGroupId,
  onDataChange,
}: {
  hireGroupId: string;
  onDataChange?: () => void;
}) {
  const { chrome } = useHireWorkspace();
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

  if (!contractEnded) {
    return (
      <HireActiveCompanyPaymentsView
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

  return (
    <HireEndedCompanyPaymentsView hireGroupId={hireGroupId} data={data} onReload={reload} />
  );
}
