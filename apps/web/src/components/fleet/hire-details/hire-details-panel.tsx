"use client";

import { loadRentalHireDetailsAction, type HireDetailsPayload } from "@/app/actions/hire-details";
import { HireDetailsView } from "@/components/fleet/hire-details/hire-details-view";
import { useCallback, useEffect, useState, useTransition } from "react";

export function RentalHireDetailsPanel({ hireGroupId }: { hireGroupId: string }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDetailsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadRentalHireDetailsAction(hireGroupId);
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

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading details…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return <HireDetailsView data={data} audience="staff" />;
}
