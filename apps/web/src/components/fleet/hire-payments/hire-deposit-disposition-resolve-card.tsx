"use client";

import { RphSelect } from "@/components/forms/rph-select";
import {
  previewHireDepositResolutionAction,
  resolveHireDepositDispositionAction,
} from "@/app/actions/rental-hire-termination";
import { depositResolutionHelpText } from "@/lib/fleet/hire-deposit-resolution";
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
    <section className="rph-card space-y-4 border-amber-500/30 p-4">
      <div>
        <h2 className="text-sm font-semibold text-rph-fg">Resolve held deposit</h2>
        <p className="rph-muted mt-1 text-sm">{depositResolutionHelpText()}</p>
        <p className="mt-2 text-sm text-rph-fg">
          Deposit held: <span className="font-medium tabular-nums">{formatGbp(heldGbp)}</span>
          {terminationSummary.depositGbp > heldGbp + 0.005 ? (
            <span className="text-rph-fg-muted">
              {" "}
              (contract {formatGbp(terminationSummary.depositGbp)};{" "}
              {formatGbp(terminationSummary.depositGbp - heldGbp)} still unpaid)
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          Open balance now:{" "}
          <span className="font-medium text-rph-fg">
            {settlementBalanceLabel(currentDirection, Math.abs(currentSigned))}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-rph-fg" htmlFor="deposit-disposition">
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

      {depositDisposition === "refund_partial" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-rph-fg" htmlFor="deposit-refund-amount">
            Refund amount (£)
          </label>
          <input
            id="deposit-refund-amount"
            className="rph-input w-full"
            inputMode="decimal"
            value={depositRefundAmountGbp}
            onChange={(event) => setDepositRefundAmountGbp(event.target.value)}
          />
        </div>
      ) : null}

      {needsDepositReason ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-rph-fg" htmlFor="deposit-reason">
            {depositDispositionReasonLabel(depositDisposition)}
          </label>
          <textarea
            id="deposit-reason"
            className="rph-input min-h-20 w-full"
            value={depositDispositionReason}
            onChange={(event) => setDepositDispositionReason(event.target.value)}
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-rph-border bg-rph-chrome/40 px-3 py-2 text-sm">
        <p className="text-rph-fg-secondary">After deposit action:</p>
        {previewPending ? (
          <p className="mt-1 text-xs text-rph-fg-muted">Calculating…</p>
        ) : preview ? (
          <>
            {preview.depositAppliedToBalanceGbp > 0.005 ? (
              <p className="mt-1 text-xs text-rph-fg-muted tabular-nums">
                {settlementBalanceLabel(currentDirection, Math.abs(currentSigned))}
                {" − "}
                deposit applied {formatGbp(preview.depositAppliedToBalanceGbp)}
                {" = "}
                {settlementBalanceLabel(afterDirection, Math.abs(afterSigned))}
              </p>
            ) : null}
            <p className="mt-1 font-medium text-rph-fg">
              {settlementBalanceLabel(afterDirection, Math.abs(afterSigned))}
            </p>
            {preview.depositRefundDueGbp > 0.005 ? (
              <p className="mt-1 text-sm text-rph-fg-secondary">
                Deposit refund due:{" "}
                <span className="font-medium tabular-nums text-rph-fg">
                  {formatGbp(preview.depositRefundDueGbp)}
                </span>
              </p>
            ) : null}
          </>
        ) : previewError ? (
          <p className="mt-1 text-xs text-rph-fg-muted">{previewError}</p>
        ) : null}
      </div>

      {needsSettlementStep && preview ? (
        <div className="space-y-3 border-t border-rph-border pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-rph-fg" htmlFor="settlement-resolution">
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-rph-fg" htmlFor="settlement-method">
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-rph-fg" htmlFor="settlement-reference">
                  Reference (optional)
                </label>
                <input
                  id="settlement-reference"
                  className="rph-input w-full"
                  value={settlementPaymentReference}
                  onChange={(event) => setSettlementPaymentReference(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {!deferSubmit ? (
        <button
          type="button"
          className="rph-btn-primary"
          onClick={submit}
          disabled={pending || previewPending || !canSubmit || !preview}
        >
          Resolve deposit — {hireDepositDispositionLabel(depositDisposition)}
        </button>
      ) : (
        <p className="text-sm text-rph-fg-secondary">
          Deposit will be resolved when you confirm the final account below.
        </p>
      )}
    </section>
  );
}
