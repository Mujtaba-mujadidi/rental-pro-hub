"use client";

import { loadDriverHireDetailsAction, type HireDetailsPayload } from "@/app/actions/hire-details";
import { HireDetailsView } from "@/components/fleet/hire-details/hire-details-view";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DriverHireDetailsSection({ hireGroupId }: { hireGroupId: string }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<HireDetailsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverHireDetailsAction(hireGroupId);
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
    return <p className="rph-muted text-sm" role="status">Loading details…</p>;
  }
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  return <HireDetailsView data={data} audience="driver" />;
}
