"use client";

import { useState, type ReactNode } from "react";
import { hireDetailsDocumentFileName } from "@/components/fleet/hire-details/hire-details-doc-actions";

async function downloadFile(url: string, fileName: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download file.");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function HireDetailsDocumentRow({
  label,
  subtitle,
  statusLabel,
  statusTone,
  viewUrl,
  resolveUrl,
  fileName,
  icon,
  onError,
}: {
  label: string;
  subtitle: string | null;
  statusLabel: string;
  statusTone: "success" | "warn" | "muted";
  viewUrl?: string | null;
  resolveUrl?: () => Promise<string>;
  fileName: string;
  icon?: ReactNode;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState<"view" | "download" | null>(null);
  const canAccess = Boolean(viewUrl || resolveUrl);

  async function obtainUrl(): Promise<string> {
    if (resolveUrl) return resolveUrl();
    if (!viewUrl) throw new Error("Document is not available.");
    return viewUrl;
  }

  async function viewDoc() {
    setPending("view");
    try {
      const url = await obtainUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not open document.");
    } finally {
      setPending(null);
    }
  }

  async function downloadDoc() {
    setPending("download");
    try {
      const url = await obtainUrl();
      try {
        await downloadFile(url, fileName);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not download document.");
    } finally {
      setPending(null);
    }
  }

  return (
    <li className="hire-ws-details-doc-row">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="hire-ws-details-doc-icon" aria-hidden>
          {icon ?? <DocIcon />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rph-fg">{label}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-rph-fg-secondary">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        <span className={`hire-ws-details-doc-chip hire-ws-details-doc-chip-${statusTone}`}>
          <span className="hire-ws-details-doc-chip-dot" aria-hidden />
          {statusLabel}
        </span>
        {canAccess ? (
          <>
            <button
              type="button"
              className="hire-ws-details-doc-view-btn"
              disabled={pending != null}
              onClick={() => void viewDoc()}
            >
              <EyeIcon />
              View
            </button>
            <button
              type="button"
              className="hire-ws-details-doc-download-btn"
              disabled={pending != null}
              aria-label={`Download ${label}`}
              onClick={() => void downloadDoc()}
            >
              <DownloadIcon />
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export { hireDetailsDocumentFileName };

function DocIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
