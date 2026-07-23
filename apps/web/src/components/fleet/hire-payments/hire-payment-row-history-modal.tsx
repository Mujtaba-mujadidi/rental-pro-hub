"use client";

import { loadHirePaymentRowEventsAction } from "@/app/actions/hire-payments";
import type { HirePaymentRowEventDisplay } from "@/lib/fleet/hire-payment-row-history";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { useEffect, useState, useTransition } from "react";

export function HirePaymentRowHistoryModal({
  scheduleRowId,
  periodLabel,
  open,
  onClose,
}: {
  scheduleRowId: string;
  periodLabel: string;
  open: boolean;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<HirePaymentRowEventDisplay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setEvents(null);
    setError(null);
    startTransition(async () => {
      const res = await loadHirePaymentRowEventsAction(scheduleRowId);
      if (!res.ok) {
        setError(res.error);
        setEvents([]);
        return;
      }
      setEvents(res.events);
    });
  }, [open, scheduleRowId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hire-history-modal-title"
        className="relative z-[1] flex max-h-[min(90vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <h2 id="hire-history-modal-title" className="text-lg font-semibold text-rph-fg">
            Payment history
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">{periodLabel}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {pending && !events ? (
            <p className="rph-muted text-sm" role="status">
              Loading history…
            </p>
          ) : null}
          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
          {events && !events.length ? (
            <p className="rph-muted text-sm">No payment activity recorded for this period yet.</p>
          ) : null}
          {events && events.length > 0 ? (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="rph-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-rph-fg">{event.title}</p>
                    <p className="rph-meta text-xs">{formatUkDateTime(event.createdAt)}</p>
                  </div>
                  <p className="rph-meta mt-1 text-xs">{event.actorLabel}</p>
                  {event.detailLines.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-sm text-rph-fg-secondary">
                      {event.detailLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {event.body ? (
                    <p className="mt-2 rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm text-rph-fg">
                      {event.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-rph-border px-5 py-4 sm:px-6">
          <button type="button" className="rph-btn-ghost h-10 px-4" disabled={pending} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
