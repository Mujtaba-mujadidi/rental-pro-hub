"use client";

import {
  exportDriverHirePaymentStatementAction,
  exportHirePaymentStatementAction,
} from "@/app/actions/hire-payments";
import { exportHireBalanceAccountStatementAction } from "@/app/actions/rental-hire-termination";
import { useState, useTransition } from "react";

export function HirePaymentStatementDownloadButton({
  hireGroupId,
  variant = "banner",
  asDriver = false,
  source = "hire-payments",
  className,
}: {
  hireGroupId: string;
  variant?: "banner" | "default";
  asDriver?: boolean;
  source?: "hire-payments" | "balance-account";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res =
          source === "balance-account"
            ? await exportHireBalanceAccountStatementAction(hireGroupId)
            : asDriver
              ? await exportDriverHirePaymentStatementAction(hireGroupId)
              : await exportHirePaymentStatementAction(hireGroupId);
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
    <div className={`flex flex-col gap-1 ${className ?? "items-end"}`}>
      <button
        type="button"
        className={
          variant === "banner" ? "hire-ws-payments-statement-btn-banner" : "hire-ws-inspection-download-btn"
        }
        disabled={pending}
        aria-busy={pending}
        onClick={download}
      >
        <DownloadIcon />
        {pending ? "Preparing…" : variant === "banner" ? "Download statement" : "Download account statement"}
      </button>
      {error ? (
        <p className={`text-xs ${variant === "banner" ? "text-red-200" : "text-red-600"}`}>{error}</p>
      ) : null}
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
