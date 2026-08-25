"use client";

import { amendExtraChargePaidAmountAction } from "@/app/actions/hire-driver-charges";
import type { ExtraChargePaymentTableRow } from "@/lib/fleet/hire-driver-charge-payment";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useState, useTransition } from "react";

function parseAmountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function HireExtraChargeAmendPaymentModal({
  hireGroupId,
  row,
  open,
  onClose,
  onSuccess,
}: {
  hireGroupId: string;
  row: ExtraChargePaymentTableRow;
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
  const chargeLabel = row.description
    ? `${row.chargeTypeLabel} · ${row.description}`
    : row.chargeTypeLabel;

  function handleSubmit() {
    if (parsedAmount == null) {
      setError("Enter a valid paid amount.");
      return;
    }
    if (parsedAmount - row.chargedGbp > 0.005) {
      setError(`Paid amount cannot exceed ${formatGbp(row.chargedGbp)}.`);
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A reason is required when amending a payment.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await amendExtraChargePaidAmountAction({
        hireGroupId,
        chargeLineItemId: row.id,
        paidGbp: parsedAmount,
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
        aria-labelledby="hire-extra-amend-payment-title"
        className="relative z-[1] flex max-h-[min(90vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <h2 id="hire-extra-amend-payment-title" className="text-lg font-semibold text-rph-fg">
            Amend paid amount
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Adjust how much of this extra charge is marked paid. Any remainder stays on the hire
            balance. Setting it to £0.00 clears the paid amount. The previous value stays in the
            audit trail.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
            <p className="font-medium text-rph-fg">{chargeLabel}</p>
            <p className="rph-meta text-xs">
              Charged {formatGbp(row.chargedGbp)} · Currently paid {formatGbp(row.paidGbp)}
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">New paid amount</span>
            <input
              className="rph-input w-full tabular-nums"
              inputMode="decimal"
              value={amount}
              disabled={pending}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="rph-meta text-xs">Maximum {formatGbp(row.chargedGbp)} for this charge</p>
            {parsedAmount === 0 ? (
              <p className="rph-meta text-xs">
                This will clear the paid amount. The charge will show as unpaid again.
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Amendment reason (required)</span>
            <textarea
              className="rph-input min-h-[4.5rem] w-full text-sm"
              placeholder="Why is this paid amount being changed?"
              value={reason}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
        </div>

        <div className="rph-modal-footer rph-modal-footer-end">
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
