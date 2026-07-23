"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { rejectHirePaymentRowAction } from "@/app/actions/hire-payments";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useState, useTransition } from "react";

export function HirePaymentRejectModal({
  row,
  open,
  onClose,
  onSuccess,
}: {
  row: HirePaymentPageRow;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setComment("");
    setError(null);
  }, [open, row.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  function handleSubmit() {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("A reason is required when rejecting a payment.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await rejectHirePaymentRowAction({ scheduleRowId: row.id, comment: trimmed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hire-reject-modal-title"
        className="relative z-[1] flex max-h-[min(90vh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <h2 id="hire-reject-modal-title" className="text-lg font-semibold text-rph-fg">
            Reject payment
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            The hirer will see your reason and can submit payment again.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
            <p className="font-medium text-rph-fg">{row.periodLabel}</p>
            {row.pendingSubmittedGbp != null ? (
              <p className="rph-meta text-xs">Submitted {formatGbp(row.pendingSubmittedGbp)}</p>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Reason (required)</span>
            <textarea
              className="rph-input min-h-[5rem] w-full text-sm"
              placeholder="Explain why this payment is being rejected…"
              value={comment}
              disabled={pending}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-rph-border px-5 py-4 sm:px-6">
          <button type="button" className="rph-btn-ghost h-10 px-4" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rph-btn-primary h-10 px-4"
            disabled={pending || !comment.trim()}
            onClick={handleSubmit}
          >
            {pending ? "Rejecting…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
