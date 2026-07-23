"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { amendApprovedHirePaymentRowAction } from "@/app/actions/hire-payments";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useState, useTransition } from "react";

function parseAmountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function HirePaymentAmendModal({
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
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setAmount(row.paidGbp.toFixed(2));
    setReason("");
    setError(null);
  }, [open, row.id, row.paidGbp]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const parsedAmount = parseAmountInput(amount);

  function handleSubmit() {
    if (parsedAmount == null) {
      setError("Enter a valid approved amount.");
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A reason is required when amending an approved payment.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await amendApprovedHirePaymentRowAction({
        scheduleRowId: row.id,
        approvedAmountGbp: parsedAmount,
        reason: trimmedReason,
      });
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
        aria-labelledby="hire-amend-modal-title"
        className="relative z-[1] flex max-h-[min(90vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <h2 id="hire-amend-modal-title" className="text-lg font-semibold text-rph-fg">
            Amend approved payment
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Adjust the recorded paid amount. The previous value is kept in the audit trail.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
            <p className="font-medium text-rph-fg">{row.periodLabel}</p>
            <p className="rph-meta text-xs">
              Due {formatGbp(row.netDueGbp)} · Currently approved {formatGbp(row.paidGbp)}
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">New approved amount</span>
            <input
              className="rph-input w-full tabular-nums"
              inputMode="decimal"
              value={amount}
              disabled={pending}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="rph-meta text-xs">Maximum {formatGbp(row.netDueGbp)} for this period</p>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Amendment reason (required)</span>
            <textarea
              className="rph-input min-h-[4.5rem] w-full text-sm"
              placeholder="Why is this approved amount being changed?"
              value={reason}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
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
            disabled={pending || parsedAmount == null || !reason.trim()}
            onClick={handleSubmit}
          >
            {pending ? "Saving…" : "Confirm amendment"}
          </button>
        </div>
      </div>
    </div>
  );
}
