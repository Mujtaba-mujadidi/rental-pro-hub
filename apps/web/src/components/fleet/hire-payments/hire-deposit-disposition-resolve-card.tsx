"use client";

import { RphSelect } from "@/components/forms/rph-select";
import {
  previewHireDepositResolutionAction,
  resolveHireDepositDispositionAction,
} from "@/app/actions/rental-hire-termination";
import type { DepositResolutionPreview } from "@/lib/fleet/hire-deposit-resolution";
import { openBalanceDirection } from "@/lib/fleet/hire-open-balance";
import {
  defaultDepositDisposition,
  settlementResolutionLabel,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  depositDispositionReasonLabel,
  requiresDepositDispositionReason,
} from "@/lib/fleet/hire-rent-settlement";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useState, useTransition } from "react";

export type HireDepositFinalizePayload = {
  depositDisposition: HireDepositDisposition;
  depositDispositionReason?: string;
  depositRefundAmountGbp?: number;
  settlementResolution?: HireSettlementResolution;
  settlementPaymentMethod?: string;
  settlementPaymentReference?: string;
};

export function HireDepositDispositionResolveCard({
  hireGroupId,
  terminationSummary,
  depositHeldGbp,
  currentSignedSettlementGbp,
  onSuccess,
  deferSubmit = false,
  onFinalizePayloadChange,
}: {
  hireGroupId: string;
  terminationSummary: HireTerminationAccountsSummary;
  /** Amount actually received and still held — not the contractual deposit. */
  depositHeldGbp: number;
  currentSignedSettlementGbp: number;
  onSuccess: () => void;
  /** When true, hide the resolve button — parent commits on final account confirm. */
  deferSubmit?: boolean;
  onFinalizePayloadChange?: (payload: HireDepositFinalizePayload | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [previewPending, startPreviewTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DepositResolutionPreview | null>(null);
  const [depositDisposition, setDepositDisposition] = useState<HireDepositDisposition>(() =>
    defaultDepositDisposition(currentSignedSettlementGbp),
  );
  const [depositDispositionReason, setDepositDispositionReason] = useState("");
  const [depositRefundAmountGbp, setDepositRefundAmountGbp] = useState("");
  const [settlementResolution, setSettlementResolution] = useState<HireSettlementResolution>("open_balance");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("bank_transfer");
  const [settlementPaymentReference, setSettlementPaymentReference] = useState("");

  const heldGbp = Math.max(0, Number(depositHeldGbp) || 0);

  useEffect(() => {
    const recommended = defaultDepositDisposition(currentSignedSettlementGbp);
    setDepositDisposition((prev) => {
      // Keep the staff choice unless the live balance makes it invalid
      // (e.g. after return charges change what the driver owes).
      if (prev === "apply_to_balance" && currentSignedSettlementGbp <= 0.005) {
        return recommended;
      }
      if (prev === "refund_full" && currentSignedSettlementGbp > 0.005) {
        return recommended;
      }
      return prev;
    });
  }, [currentSignedSettlementGbp]);

  useEffect(() => {
    startPreviewTransition(async () => {
      setPreviewError(null);
      const res = await previewHireDepositResolutionAction({
        hireGroupId,
        depositDisposition,
        depositRefundAmountGbp:
          depositDisposition === "refund_partial" && depositRefundAmountGbp.trim()
            ? Number(depositRefundAmountGbp)
            : undefined,
      });
      if (!res.ok) {
        setPreview(null);
        setPreviewError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }, [
    hireGroupId,
    depositDisposition,
    depositRefundAmountGbp,
    currentSignedSettlementGbp,
    depositHeldGbp,
  ]);

  const depositOptions = preview?.depositOptions ?? [];
  const effectiveSettlementResolution =
    preview && preview.settlementResolutions.includes(settlementResolution)
      ? settlementResolution
      : (preview?.settlementResolutions[0] ?? "open_balance");

  const needsDepositReason = requiresDepositDispositionReason(depositDisposition);
  const needsSettlementStep = preview?.needsSettlementStep ?? false;

  const submit = () => {
    startTransition(async () => {
      setError(null);
      const res = await resolveHireDepositDispositionAction({
        hireGroupId,
        depositDisposition,
        depositDispositionReason: depositDispositionReason || undefined,
        depositRefundAmountGbp:
          depositDisposition === "refund_partial" ? Number(depositRefundAmountGbp) : undefined,
        settlementResolution: needsSettlementStep ? effectiveSettlementResolution : undefined,
        settlementPaymentMethod: needsSettlementStep ? settlementPaymentMethod : undefined,
        settlementPaymentReference: settlementPaymentReference || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
    });
  };

  const canSubmit =
    depositOptions.find((option) => option.value === depositDisposition)?.allowed &&
    (!needsDepositReason || depositDispositionReason.trim()) &&
    (depositDisposition !== "refund_partial" || depositRefundAmountGbp.trim()) &&
    (!needsSettlementStep ||
      (preview?.settlementResolutions.includes(effectiveSettlementResolution) ?? false));

  useEffect(() => {
    if (!deferSubmit || !onFinalizePayloadChange) return;
    if (!canSubmit || !preview) {
      onFinalizePayloadChange(null);
      return;
    }
    onFinalizePayloadChange({
      depositDisposition,
      depositDispositionReason: depositDispositionReason.trim() || undefined,
      depositRefundAmountGbp:
        depositDisposition === "refund_partial" && depositRefundAmountGbp.trim()
          ? Number(depositRefundAmountGbp)
          : undefined,
      settlementResolution: needsSettlementStep ? effectiveSettlementResolution : undefined,
      settlementPaymentMethod: needsSettlementStep ? settlementPaymentMethod : undefined,
      settlementPaymentReference: settlementPaymentReference.trim() || undefined,
    });
  }, [
    deferSubmit,
    onFinalizePayloadChange,
    canSubmit,
    preview,
    depositDisposition,
    depositDispositionReason,
    depositRefundAmountGbp,
    needsSettlementStep,
    effectiveSettlementResolution,
    settlementPaymentMethod,
    settlementPaymentReference,
  ]);

  const currentSigned = Number(currentSignedSettlementGbp) || 0;
  const currentDirection = openBalanceDirection(currentSigned);
  const afterSigned = preview?.afterSignedSettlementGbp ?? currentSigned;
  const afterDirection = preview?.afterDirection ?? currentDirection;

  return (
    <section className="hire-ended-deposit-review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="hire-balance-panel-kicker">Deposit review</p>
          <h2 className="mt-1 text-base font-semibold text-rph-fg">
            Deposit held
            <span className="tabular-nums"> · {formatGbp(heldGbp)}</span>
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Open balance{" "}
            <span className="font-medium text-rph-fg">
              {settlementBalanceLabel(currentDirection, Math.abs(currentSigned))}
            </span>
            {terminationSummary.depositGbp > heldGbp + 0.005 ? (
              <span className="text-rph-fg-muted">
                {" "}
                · contract {formatGbp(terminationSummary.depositGbp)}
              </span>
            ) : null}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Awaiting review
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-rph-fg-muted" htmlFor="deposit-disposition">
            Deposit action
          </label>
          <RphSelect
            value={depositDisposition}
            aria-label="Deposit action"
            options={depositOptions.map((option) => ({
              value: option.value,
              label:
                option.label +
                (!option.allowed && option.disabledReason ? ` — ${option.disabledReason}` : ""),
              disabled: !option.allowed,
            }))}
            onValueChange={(value) => setDepositDisposition(value as HireDepositDisposition)}
          />
        </div>
        <div className="rounded-lg border border-rph-border bg-rph-page/60 px-3 py-2 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-rph-fg-muted">
            After deposit action
          </p>
          {previewPending ? (
            <p className="mt-0.5 text-xs text-rph-fg-muted">Calculating…</p>
          ) : preview ? (
            <p className="mt-0.5 font-semibold tabular-nums text-rph-fg">
              {settlementBalanceLabel(afterDirection, Math.abs(afterSigned))}
              {preview.depositRefundDueGbp > 0.005
                ? ` · refund ${formatGbp(preview.depositRefundDueGbp)}`
                : ""}
            </p>
          ) : previewError ? (
            <p className="mt-0.5 text-xs text-rph-fg-muted">{previewError}</p>
          ) : (
            <p className="mt-0.5 text-xs text-rph-fg-muted">—</p>
          )}
        </div>
      </div>

      {depositDisposition === "refund_partial" ? (
        <div className="mt-3 space-y-1.5">
          <label className="text-xs font-medium text-rph-fg-muted" htmlFor="deposit-refund-amount">
            Refund amount (£)
          </label>
          <input
            id="deposit-refund-amount"
            className="rph-input w-full max-w-xs"
            inputMode="decimal"
            value={depositRefundAmountGbp}
            onChange={(event) => setDepositRefundAmountGbp(event.target.value)}
          />
        </div>
      ) : null}

      {needsDepositReason ? (
        <div className="mt-3 space-y-1.5">
          <label className="text-xs font-medium text-rph-fg-muted" htmlFor="deposit-reason">
            {depositDispositionReasonLabel(depositDisposition)}
          </label>
          <textarea
            id="deposit-reason"
            className="rph-input min-h-16 w-full"
            value={depositDispositionReason}
            onChange={(event) => setDepositDispositionReason(event.target.value)}
          />
        </div>
      ) : null}

      {needsSettlementStep && preview ? (
        <div className="mt-3 grid gap-3 border-t border-rph-border pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-rph-fg-muted" htmlFor="settlement-resolution">
              How to clear the balance
            </label>
            <RphSelect
              value={effectiveSettlementResolution}
              aria-label="How to clear the balance"
              options={preview.settlementResolutions.map((resolution) => ({
                value: resolution,
                label: settlementResolutionLabel(resolution),
              }))}
              onValueChange={(value) =>
                setSettlementResolution(value as HireSettlementResolution)
              }
            />
          </div>

          {effectiveSettlementResolution === "paid_now" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-rph-fg-muted" htmlFor="settlement-method">
                  Payment method
                </label>
                <RphSelect
                  value={settlementPaymentMethod}
                  aria-label="Payment method"
                  options={HIRE_DEPOSIT_REFUND_METHODS.map((method) => ({
                    value: method,
                    label: method.replace(/_/g, " "),
                  }))}
                  onValueChange={setSettlementPaymentMethod}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-rph-fg-muted" htmlFor="settlement-reference">
                  Reference (optional)
                </label>
                <input
                  id="settlement-reference"
                  className="rph-input w-full max-w-md"
                  value={settlementPaymentReference}
                  onChange={(event) => setSettlementPaymentReference(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rph-alert-error mt-3 text-sm">{error}</p> : null}

      {!deferSubmit ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rph-btn-primary"
            onClick={submit}
            disabled={pending || previewPending || !canSubmit || !preview}
          >
            Resolve deposit — {hireDepositDispositionLabel(depositDisposition)}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-rph-fg-secondary">
          Deposit will be resolved when you confirm the final account.
        </p>
      )}
    </section>
  );
}
