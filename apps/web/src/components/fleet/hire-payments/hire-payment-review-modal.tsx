"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  approveHirePaymentRowAction,
  rejectHirePaymentRowAction,
} from "@/app/actions/hire-payments";
import {
  approveDriverExtraChargePaymentAction,
  rejectDriverExtraChargePaymentAction,
} from "@/app/actions/hire-driver-charges";
import { formatGbp } from "@/lib/fleet/maintenance";
import { hirePaymentPendingApprovalAmountGbp } from "@/lib/fleet/hire-payment-display";
import { addGbp, roundGbp, subGbp } from "@/lib/fleet/hire-money";
import { useEffect, useMemo, useState, useTransition } from "react";

export type HirePaymentReviewAllocationLine = {
  rowId: string;
  label: string;
  allocatedGbp: number;
  rowBalanceAfterGbp: number;
  fullyAllocated: boolean;
};

export type HirePaymentReviewTarget =
  | { kind: "schedule"; row: HirePaymentPageRow }
  | {
      kind: "extra_charges";
      hireGroupId: string;
      amountGbp: number;
      paymentReference: string | null;
      /** Total outstanding extras on the hire (context only). */
      outstandingGbp: number;
      /** Focused charge line when opened from a row action. */
      focusChargeLineItemId?: string;
      title?: string;
      chargedGbp?: number;
      paidGbp?: number;
      balanceGbp?: number;
      allocations?: readonly HirePaymentReviewAllocationLine[];
    };

function scheduleSubmittedGbp(row: HirePaymentPageRow): number {
  return hirePaymentPendingApprovalAmountGbp(row);
}

export function HirePaymentReviewModal({
  target,
  open,
  onClose,
  onSuccess,
}: {
  target: HirePaymentReviewTarget | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setRejectOpen(false);
    setComment("");
    setError(null);
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const detail = useMemo(() => {
    if (!target) return null;
    if (target.kind === "schedule") {
      const row = target.row;
      const submittedGbp = scheduleSubmittedGbp(row);
      const paidAfterApprove = roundGbp(addGbp(row.paidGbp, submittedGbp));
      const balanceAfterApprove = roundGbp(Math.max(0, subGbp(row.netDueGbp, paidAfterApprove)));
      return {
        title: row.periodLabel,
        kindLabel: row.rowKind === "deposit" ? "Deposit" : "Rent",
        submittedGbp,
        dueGbp: row.netDueGbp,
        paidGbp: row.paidGbp,
        balanceGbp: row.balanceGbp,
        paidAfterApprove,
        balanceAfterApprove,
        paymentReference: null as string | null,
        allocations: null as HirePaymentReviewAllocationLine[] | null,
        hireOutstandingGbp: null as number | null,
        allocatedToFocusGbp: null as number | null,
      };
    }

    const allocations = target.allocations?.length ? [...target.allocations] : null;
    const focusId = target.focusChargeLineItemId?.trim() || null;
    const focusAllocation = focusId
      ? allocations?.find((line) => line.rowId === focusId) ?? null
      : null;
    const allocatedToFocusGbp = focusAllocation?.allocatedGbp ?? null;

    const dueGbp =
      target.chargedGbp ??
      (focusId ? target.balanceGbp : null) ??
      target.outstandingGbp;
    const paidGbp =
      target.paidGbp ??
      roundGbp(Math.max(0, subGbp(dueGbp, target.balanceGbp ?? target.outstandingGbp)));
    const balanceGbp = target.balanceGbp ?? target.outstandingGbp;

    const appliedGbp = allocatedToFocusGbp ?? target.amountGbp;
    const paidAfterApprove = roundGbp(addGbp(paidGbp, appliedGbp));
    const balanceAfterApprove = roundGbp(Math.max(0, subGbp(dueGbp, paidAfterApprove)));

    return {
      title: target.title?.trim() || "Extra charges",
      kindLabel: "Extra charges",
      submittedGbp: target.amountGbp,
      dueGbp,
      paidGbp,
      balanceGbp,
      paidAfterApprove,
      balanceAfterApprove,
      paymentReference: target.paymentReference,
      allocations,
      hireOutstandingGbp:
        focusId && Math.abs(target.outstandingGbp - balanceGbp) > 0.005
          ? target.outstandingGbp
          : null,
      allocatedToFocusGbp,
    };
  }, [target]);

  if (!open || !target || !detail) return null;

  function approve() {
    setError(null);
    startTransition(async () => {
      const res =
        target!.kind === "schedule"
          ? await approveHirePaymentRowAction(target!.row.id)
          : await approveDriverExtraChargePaymentAction(target!.hireGroupId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
      onClose();
    });
  }

  function reject() {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("A reason is required when rejecting a payment.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res =
        target!.kind === "schedule"
          ? await rejectHirePaymentRowAction({ scheduleRowId: target!.row.id, comment: trimmed })
          : await rejectDriverExtraChargePaymentAction({
              hireGroupId: target!.hireGroupId,
              comment: trimmed,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden onClick={() => !pending && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hire-payment-review-title"
        className="relative z-[1] flex max-h-[min(92vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-rph-border bg-rph-elevated shadow-2xl sm:rounded-2xl"
      >
        <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">{detail.kindLabel}</p>
          <h2 id="hire-payment-review-title" className="mt-1 text-lg font-semibold text-rph-fg">
            Review payment
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">{detail.title}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Submitted for approval
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">
              {formatGbp(detail.submittedGbp)}
            </p>
            {detail.allocatedToFocusGbp != null &&
            Math.abs(detail.allocatedToFocusGbp - detail.submittedGbp) > 0.005 ? (
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                {formatGbp(detail.allocatedToFocusGbp)} of this payment is allocated to this charge
              </p>
            ) : null}
            {detail.paymentReference ? (
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                Reference: {detail.paymentReference}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-rph-fg-muted">Due</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">{formatGbp(detail.dueGbp)}</dd>
            </div>
            <div>
              <dt className="text-xs text-rph-fg-muted">Paid (approved)</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">{formatGbp(detail.paidGbp)}</dd>
            </div>
            <div>
              <dt className="text-xs text-rph-fg-muted">Balance now</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-rph-fg">{formatGbp(detail.balanceGbp)}</dd>
            </div>
          </dl>

          {detail.hireOutstandingGbp != null ? (
            <p className="text-xs text-rph-fg-secondary">
              All outstanding extras on this hire: {formatGbp(detail.hireOutstandingGbp)}
            </p>
          ) : null}

          {detail.allocations?.length ? (
            <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2">
              <p className="text-xs font-medium text-rph-fg-muted">Allocation if approved</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {detail.allocations.map((line) => (
                  <li key={line.rowId} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-rph-fg">
                      {line.label}
                      <span className="mt-0.5 block text-xs text-rph-fg-secondary">
                        Balance after: {formatGbp(line.rowBalanceAfterGbp)}
                        {line.fullyAllocated ? " · paid in full" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-rph-fg">
                      {formatGbp(line.allocatedGbp)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-xs leading-relaxed text-rph-fg-secondary">
            If approved, paid will become {formatGbp(detail.paidAfterApprove)} and the balance will be{" "}
            {formatGbp(detail.balanceAfterApprove)}. Pending payments are not counted as received until
            approved.
          </p>

          {rejectOpen ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-rph-fg-muted">Reason for rejection (required)</span>
              <textarea
                className="rph-input min-h-[5rem] w-full text-sm"
                placeholder="Explain why this payment is being rejected…"
                value={comment}
                disabled={pending}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          ) : null}

          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
        </div>

        <div className="rph-modal-footer shrink-0 border-t border-rph-border px-5 py-4 sm:px-6">
          <button type="button" className="rph-btn-ghost h-10 w-full px-4 sm:w-auto" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <div className="rph-modal-footer-end">
            {!rejectOpen ? (
              <>
                <button
                  type="button"
                  className="rph-btn-ghost h-10 w-full px-4 sm:w-auto"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setRejectOpen(true);
                  }}
                >
                  Reject…
                </button>
                <button type="button" className="rph-btn-primary h-10 w-full px-4 sm:w-auto" disabled={pending} onClick={approve}>
                  {pending ? "Approving…" : "Approve payment"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rph-btn-ghost h-10 w-full px-4 sm:w-auto"
                  disabled={pending}
                  onClick={() => {
                    setRejectOpen(false);
                    setComment("");
                    setError(null);
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rph-btn-primary h-10 w-full px-4 sm:w-auto"
                  disabled={pending || !comment.trim()}
                  onClick={reject}
                >
                  {pending ? "Rejecting…" : "Confirm reject"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
