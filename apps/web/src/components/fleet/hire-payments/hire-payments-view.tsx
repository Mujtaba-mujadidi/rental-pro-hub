"use client";

import {
  loadHirePaymentsPageAction,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveCompanyPaymentsView } from "@/components/fleet/hire-payments/hire-active-company-payments-view";
import { HireEndedCompanyPaymentsView } from "@/components/fleet/hire-payments/hire-ended-company-payments-view";
import { useHireWorkspaceCachedLoad } from "@/hooks/use-hire-workspace-cached-load";
import { hireWorkspaceKeysInvalidatedByPaymentChange } from "@/lib/fleet/hire-workspace-tab-cache";
import { useHireWorkspace } from "@/app/(main)/rental/hires/[groupId]/hire-workspace-provider";
import { useState } from "react";

export function HirePaymentsView({
  hireGroupId,
  onDataChange,
}: {
  hireGroupId: string;
  onDataChange?: () => void;
}) {
  const { chrome, invalidateCache } = useHireWorkspace();
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);
  const query = useHireWorkspaceCachedLoad<HirePaymentsPageData>({
    key: "payments",
    load: () => loadHirePaymentsPageAction(hireGroupId),
  });

  function reload() {
    invalidateCache(hireWorkspaceKeysInvalidatedByPaymentChange());
    void onDataChange?.();
  }

  if (!query.data && query.pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading payments…</p>
      </div>
    );
  }

  if (query.error) return <p className="rph-alert-error text-sm">{query.error}</p>;
  if (!query.data) return null;

  const contractEnded = Boolean(query.data.contractEndedYmd);

  if (!contractEnded) {
    return (
      <HireActiveCompanyPaymentsView
        hireGroupId={hireGroupId}
        data={query.data}
        chrome={chrome}
        highlightedRowIds={highlightedRowIds}
        onHighlightedRowIdsChange={setHighlightedRowIds}
        onReload={reload}
        busy={query.pending}
      />
    );
  }

  return (
    <HireEndedCompanyPaymentsView hireGroupId={hireGroupId} data={query.data} onReload={reload} />
  );
}
