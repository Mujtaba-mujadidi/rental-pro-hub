"use client";

import { exportHireInspectionPdfAction } from "@/app/actions/hire-inspections";
import type { HireInspectionKind } from "@/lib/fleet/vehicle-damage-panels";
import { useState, useTransition } from "react";

export function HireInspectionPdfExportButton({
  hireGroupId,
  kind,
  vehicleLabel,
}: {
  hireGroupId: string;
  kind: HireInspectionKind;
  vehicleLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await exportHireInspectionPdfAction(hireGroupId, kind, vehicleLabel);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = res.fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      })();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rph-btn-ghost text-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={download}
      >
        Download PDF
      </button>
      {pending ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-rph-border border-t-rph-rail"
          role="status"
          aria-label="Preparing PDF"
        />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
