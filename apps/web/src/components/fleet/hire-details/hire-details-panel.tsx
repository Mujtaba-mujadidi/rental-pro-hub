"use client";

import { loadRentalHireDetailsAction, type HireDetailsPayload } from "@/app/actions/hire-details";
import { HireDetailsView } from "@/components/fleet/hire-details/hire-details-view";
import { useHireWorkspaceCachedLoad } from "@/hooks/use-hire-workspace-cached-load";

export function RentalHireDetailsPanel({ hireGroupId }: { hireGroupId: string }) {
  const query = useHireWorkspaceCachedLoad<HireDetailsPayload>({
    key: "details",
    load: () => loadRentalHireDetailsAction(hireGroupId),
  });

  if (!query.data && query.pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading details…</p>
      </div>
    );
  }

  if (query.error) return <p className="rph-alert-error text-sm">{query.error}</p>;
  if (!query.data) return null;

  return <HireDetailsView data={query.data} audience="staff" />;
}
