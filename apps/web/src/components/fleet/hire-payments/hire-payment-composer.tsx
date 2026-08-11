"use client";

import type { HirePaymentAccountDisplay, HirePaymentPageRow } from "@/app/actions/hire-payments";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import {
  allocatePaymentAcrossRows,
  type HirePaymentAllocationResult,
} from "@/lib/fleet/hire-payment-allocation";
import { payBalanceToDateGbp } from "@/lib/fleet/hire-active-payments-display";
import type { HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

function parseAmountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function toAllocationInputs(rows: readonly HirePaymentPageRow[]): HirePaymentScheduleRowInput[] {
  return rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: row.sortOrder,
  }));
}

export function HirePaymentComposer({
  scheduleRows,
  scheduleBalanceGbp,
  paymentAccount,
  canSubmit,
  submitLabel,
  triggerLabel = "Record payment",
  onAllocationChange,
  onSubmit,
  onSuccess,
  busy,
}: {
  /** Kept for call-site consistency; submit auth still uses hireGroupId in onSubmit. */
  hireGroupId: string;
  /** Authorised schedule rows already loaded for this hire — used for instant local preview. */
  scheduleRows: readonly HirePaymentPageRow[];
  /** Full sheet outstanding — used to enable recording when prepayment is possible. */
  scheduleBalanceGbp: number;
  paymentAccount: HirePaymentAccountDisplay | null;
  canSubmit: boolean;
  submitLabel: string;
  triggerLabel?: string;
  asDriver?: boolean;
  onAllocationChange?: (rowIds: string[]) => void;
  onSubmit: (input: { amountGbp: number; paymentReference: string }) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [allocation, setAllocation] = useState<HirePaymentAllocationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPending, startSubmit] = useTransition();

  const allocationInputs = useMemo(() => toAllocationInputs(scheduleRows), [scheduleRows]);
  const balanceShortcutGbp = useMemo(() => payBalanceToDateGbp(scheduleRows), [scheduleRows]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setAmount("");
    setReference("");
    setAllocation(null);
    setSubmitError(null);
    onAllocationChange?.([]);
  }, [onAllocationChange]);

  useEffect(() => {
    if (!open) return;

    const parsed = parseAmountInput(amount);
    if (!parsed) {
      setAllocation(null);
      onAllocationChange?.([]);
      return;
    }

    // Local FIFO allocation — same helper the server uses on submit. Debounce only the
    // parent table highlight so keystrokes stay responsive.
    const next = allocatePaymentAcrossRows(parsed, allocationInputs, ukTodayYmd());
    setAllocation(next);

    const highlightTimer = setTimeout(() => {
      onAllocationChange?.(next.allocations.map((line) => line.rowId));
    }, 250);
    return () => clearTimeout(highlightTimer);
  }, [allocationInputs, amount, onAllocationChange, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitPending) closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal, open, submitPending]);

  function handleSubmit() {
    const parsed = parseAmountInput(amount);
    if (!parsed) {
      setSubmitError("Enter a valid payment amount.");
      return;
    }
    if (!allocation?.allocations.length) {
      setSubmitError("No outstanding balance to allocate this payment to.");
      return;
    }
    setSubmitError(null);
    startSubmit(async () => {
      const res = await onSubmit({ amountGbp: parsed, paymentReference: reference });
      if (!res.ok) {
        setSubmitError(res.error ?? "Could not submit payment.");
        return;
      }
      closeModal();
      onSuccess?.();
    });
  }

  const fieldsDisabled = busy || submitPending || !canSubmit;
  const submitDisabled = fieldsDisabled || !allocation?.allocations.length;

  if (!canSubmit) return null;

  return (
    <>
      <button
        type="button"
        className="rph-btn-primary"
        disabled={fieldsDisabled || scheduleBalanceGbp <= 0}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hire-payment-modal-title"
            className="relative z-[1] flex max-h-[min(90vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
          >
            <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
              <h2 id="hire-payment-modal-title" className="text-lg font-semibold text-rph-fg">
                {triggerLabel}
              </h2>
              <p className="mt-1 text-sm text-rph-fg-secondary">
                Enter the amount paid — we allocate it to outstanding periods in date order, including future
                periods where the payment covers them in full or in part.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              {paymentAccount ? (
                <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
                  <p className="font-medium text-rph-fg">Pay to: {paymentAccount.name}</p>
                  {paymentAccount.payeeName ? (
                    <p className="text-rph-fg-secondary">{paymentAccount.payeeName}</p>
                  ) : null}
                  {paymentAccount.sortCode || paymentAccount.accountNumberMasked ? (
                    <p className="rph-meta text-xs">
                      {[paymentAccount.sortCode, paymentAccount.accountNumberMasked].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[10rem] flex-1 space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">Amount</span>
                  <input
                    className="rph-input w-full tabular-nums"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    disabled={fieldsDisabled}
                    autoFocus
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rph-btn-ghost h-10 shrink-0 px-3 text-xs"
                  disabled={fieldsDisabled || balanceShortcutGbp <= 0}
                  onClick={() => setAmount(balanceShortcutGbp.toFixed(2))}
                >
                  Pay balance to date ({formatGbp(balanceShortcutGbp)})
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Payment reference (optional)</span>
                <input
                  className="rph-input w-full"
                  value={reference}
                  disabled={fieldsDisabled}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Bank reference or note"
                />
              </label>

              {allocation?.allocations.length ? (
                <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page p-3">
                  <p className="text-sm font-medium text-rph-fg">Allocation preview</p>
                  <p className="rph-meta text-xs">
                    {allocation.allocations.length === 1
                      ? "This payment will be applied to the period below."
                      : `This payment will be split across ${allocation.allocations.length} periods (highlighted in the table).`}
                  </p>
                  <ul className="space-y-2 text-sm">
                    {allocation.allocations.map((line) => (
                      <li
                        key={line.rowId}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-rph-border pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-rph-fg-secondary">
                          {line.rowKind === "deposit"
                            ? "Deposit"
                            : `${formatUkDate(line.periodStart)} – ${formatUkDate(line.periodEnd)}`}
                          <span
                            className={`ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                              line.fullyAllocated
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            }`}
                          >
                            {line.fullyAllocated ? "Full" : "Partial"}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums text-rph-fg">
                          {formatGbp(line.allocatedGbp)}
                          {line.rowBalanceAfterGbp > 0 ? (
                            <span className="rph-meta ml-2 font-normal">
                              {formatGbp(line.rowBalanceAfterGbp)} remaining
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {allocation.unallocatedGbp > 0 ? (
                    <p className="rph-meta text-xs text-amber-800 dark:text-amber-200">
                      {formatGbp(allocation.unallocatedGbp)} exceeds the outstanding sheet balance (
                      {formatGbp(allocation.totalOutstandingGbp)}) and will not be allocated.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {submitError ? <p className="rph-alert-error text-sm">{submitError}</p> : null}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-rph-border px-5 py-4 sm:px-6">
              <button
                type="button"
                className="rph-btn-ghost h-10 px-4"
                disabled={fieldsDisabled}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rph-btn-primary h-10 px-4"
                disabled={submitDisabled}
                onClick={handleSubmit}
              >
                {submitPending ? "Submitting…" : submitLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
