"use client";

import { useState, useTransition } from "react";
import { exportHireActivityAction, loadHireActivityAction } from "@/app/actions/hire-activity";
import { useHireWorkspaceCachedLoad } from "@/hooks/use-hire-workspace-cached-load";
import type { HireActivityItem, HireActivityKind } from "@/lib/fleet/hire-activity-display";

export function HireActivityView({
  hireGroupId,
  audience,
}: {
  hireGroupId: string;
  audience: "staff" | "driver";
}) {
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const query = useHireWorkspaceCachedLoad<HireActivityItem[]>({
    key: "activity",
    useCache: audience === "staff",
    load: async () => {
      const res = await loadHireActivityAction(hireGroupId, audience);
      if (!res.ok) return res;
      return { ok: true, data: res.items };
    },
  });
  const pending = query.pending;
  const error = query.error;
  const items = query.data ?? [];

  function exportActivity() {
    setExportError(null);
    startExport(() => {
      void (async () => {
        const res = await exportHireActivityAction(hireGroupId, audience);
        if (!res.ok) {
          setExportError(res.error);
          return;
        }
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
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
    <div className="hire-ws-activity-layout">
      <header className="hire-ws-activity-intro">
        <div className="min-w-0">
          {audience === "staff" ? <p className="hire-ws-section-kicker">Full hire history</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Activity</h1>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            {audience === "staff"
              ? "A clear audit trail of actions, inspections, charges and payments."
              : "A clear record of key events and payments for your hire."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            className="hire-ws-inspection-download-btn"
            disabled={exporting || pending}
            aria-busy={exporting}
            onClick={exportActivity}
          >
            <DownloadIcon />
            {exporting ? "Preparing…" : "Export activity"}
          </button>
          {exportError ? <p className="text-xs text-red-600">{exportError}</p> : null}
        </div>
      </header>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="hire-ws-payments-panel">
        <div className="hire-ws-activity-card-head">
          <p className="hire-ws-section-kicker">Latest activity</p>
        </div>
        <div className="hire-ws-activity-scroll">
          {pending && !items.length ? (
            <p className="px-4 py-5 text-sm text-rph-fg-secondary sm:px-5">Loading activity…</p>
          ) : !items.length ? (
            <p className="px-4 py-5 text-sm text-rph-fg-secondary sm:px-5">No events recorded yet.</p>
          ) : (
            <ol className="hire-ws-activity-list">
              {items.map((item) => (
                <li key={item.id} className="hire-ws-activity-row">
                  <div className="hire-ws-activity-when">
                    <p className="hire-ws-activity-date">{item.dateLabel}</p>
                    {item.timeLabel ? <p className="hire-ws-activity-time">{item.timeLabel}</p> : null}
                  </div>
                  <div className="hire-ws-activity-rail">
                    <span className={`hire-ws-activity-icon hire-ws-activity-icon-${item.kind}`} aria-hidden>
                      <ActivityIcon kind={item.kind} />
                    </span>
                  </div>
                  <div className="hire-ws-activity-body">
                    <p className="hire-ws-activity-when-inline">{item.timestampLabel}</p>
                    <p className="text-sm font-semibold text-rph-fg">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-rph-fg-secondary">{item.description}</p>
                    {item.recordedByLabel ? (
                      <p className="mt-1.5 text-xs text-rph-fg-muted">{item.recordedByLabel}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: HireActivityKind }) {
  if (kind === "payment") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "inspection") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "warn" || kind === "charge") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "status") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
