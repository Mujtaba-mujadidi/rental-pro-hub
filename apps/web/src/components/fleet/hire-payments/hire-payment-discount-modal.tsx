"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { applyHirePaymentDiscountAction } from "@/app/actions/hire-payments";
import {
  computeHireDiscountGbp,
  parseDiscountInput,
  type HireDiscountMode,
} from "@/lib/fleet/hire-discount";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useMemo, useState, useTransition } from "react";

export function HirePaymentDiscountModal({
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
  const [mode, setMode] = useState<HireDiscountMode>("amount");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMode("amount");
    setValue(row.balanceGbp.toFixed(2));
    setReason("");
    setError(null);
  }, [open, row.balanceGbp, row.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const parsedValue = parseDiscountInput(value);
  const computedAmount = useMemo(() => {
    if (parsedValue == null) return null;
    return computeHireDiscountGbp(mode, parsedValue, row.netDueGbp, row.balanceGbp);
  }, [mode, parsedValue, row.balanceGbp, row.netDueGbp]);

  function switchMode(next: HireDiscountMode) {
    setMode(next);
    setValue(next === "amount" ? row.balanceGbp.toFixed(2) : "10");
    setError(null);
  }

  function handleSubmit() {
    const amountGbp = computedAmount;
    if (!amountGbp) {
      setError(mode === "percent" ? "Enter a valid percentage (1–100)." : "Enter a valid discount amount.");
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A reason is required for the discount.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await applyHirePaymentDiscountAction({
        scheduleRowId: row.id,
        amountGbp,
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
        aria-labelledby="hire-discount-modal-title"
        className="relative z-[1] flex max-h-[min(90vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <h2 id="hire-discount-modal-title" className="text-lg font-semibold text-rph-fg">
            Apply discount
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Reduce the amount due on this period. A reason is recorded for audit.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
            <p className="font-medium text-rph-fg">{row.periodLabel}</p>
            <p className="rph-meta text-xs">
              Due {formatGbp(row.netDueGbp)} · Balance {formatGbp(row.balanceGbp)}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-rph-fg-muted">Discount type</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={mode === "amount" ? "rph-pill-active rph-pill" : "rph-pill"}
                disabled={pending}
                onClick={() => switchMode("amount")}
              >
                Amount (£)
              </button>
              <button
                type="button"
                className={mode === "percent" ? "rph-pill-active rph-pill" : "rph-pill"}
                disabled={pending}
                onClick={() => switchMode("percent")}
              >
                Percentage (%)
              </button>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">
              {mode === "amount" ? "Discount amount" : "Discount percentage"}
            </span>
            <input
              className="rph-input w-full tabular-nums"
              inputMode="decimal"
              placeholder={mode === "amount" ? "0.00" : "10"}
              value={value}
              disabled={pending}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="rph-meta text-xs">
              {mode === "amount"
                ? `Maximum ${formatGbp(row.balanceGbp)}`
                : `Of period due (${formatGbp(row.netDueGbp)}), max 100%`}
            </p>
          </label>

          {computedAmount != null ? (
            <p className="text-sm text-rph-fg">
              Discount to apply:{" "}
              <span className="font-semibold tabular-nums">{formatGbp(computedAmount)}</span>
              {mode === "percent" && parsedValue != null ? (
                <span className="rph-meta ml-1 text-xs">({parsedValue}%)</span>
              ) : null}
            </p>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Reason (required)</span>
            <textarea
              className="rph-input min-h-[4.5rem] w-full text-sm"
              placeholder="Why is this discount being applied?"
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
            disabled={pending || computedAmount == null || !reason.trim()}
            onClick={handleSubmit}
          >
            {pending ? "Applying…" : "Apply discount"}
          </button>
        </div>
      </div>
    </div>
  );
}
