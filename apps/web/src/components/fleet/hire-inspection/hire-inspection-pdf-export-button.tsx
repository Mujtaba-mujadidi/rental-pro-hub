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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="hire-ws-inspection-download-btn"
        disabled={pending}
        aria-busy={pending}
        onClick={download}
      >
        <DownloadIcon />
        {pending ? "Preparing…" : "Download PDF"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
