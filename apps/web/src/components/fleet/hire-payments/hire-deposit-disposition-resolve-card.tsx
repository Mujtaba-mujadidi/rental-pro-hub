"use client";

import { RphSelect } from "@/components/forms/rph-select";
import { resolveHireDepositDispositionAction } from "@/app/actions/rental-hire-termination";
import {
  availableSettlementResolutions,
  getDepositDispositionOptions,
  settlementResolutionLabel,
  settlementStepRequired,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  depositDispositionReasonLabel,
  requiresDepositDispositionReason,
} from "@/lib/fleet/hire-rent-settlement";
import { depositResolutionHelpText } from "@/lib/fleet/hire-deposit-resolution";
import { computeDepositResolutionSettlement } from "@/lib/fleet/hire-deposit-resolution";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useMemo, useState, useTransition } from "react";

export function HireDepositDispositionResolveCard({
  hireGroupId,
  terminationSummary,
  currentSignedSettlementGbp,
  onSuccess,
}: {
  hireGroupId: string;
  terminationSummary: HireTerminationAccountsSummary;
  currentSignedSettlementGbp: number;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [depositDisposition, setDepositDisposition] = useState<HireDepositDisposition>("refund_full");
  const [depositDispositionReason, setDepositDispositionReason] = useState("");
  const [depositRefundAmountGbp, setDepositRefundAmountGbp] = useState("");
  const [settlementResolution, setSettlementResolution] = useState<HireSettlementResolution>("paid_now");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("bank_transfer");
  const [settlementPaymentReference, setSettlementPaymentReference] = useState("");

  const depositOptions = useMemo(
    () => getDepositDispositionOptions(terminationSummary.signedRentBalanceGbp).filter((o) => o.value !== "hold_pending"),
    [terminationSummary.signedRentBalanceGbp],
  );

  const previewNetSettlement = useMemo(
    () =>
      computeDepositResolutionSettlement({
        currentSignedSettlementGbp: currentSignedSettlementGbp,
        depositGbp: terminationSummary.depositGbp,
        disposition: depositDisposition,
        refundAmountGbp: depositRefundAmountGbp ? Number(depositRefundAmountGbp) : null,
      }),
    [
      currentSignedSettlementGbp,
      terminationSummary.depositGbp,
      depositDisposition,
      depositRefundAmountGbp,
    ],
  );

  const settlementResolutions = useMemo(
    () => availableSettlementResolutions(previewNetSettlement),
    [previewNetSettlement],
  );

  const needsDepositReason = requiresDepositDispositionReason(depositDisposition);
  const needsSettlementStep = settlementStepRequired(previewNetSettlement);
  const previewDirection =
    previewNetSettlement > 0.005
      ? "driver_owes_company"
      : previewNetSettlement < -0.005
        ? "company_owes_driver"
        : "settled";

  const submit = () => {
    startTransition(async () => {
      setError(null);
      const res = await resolveHireDepositDispositionAction({
        hireGroupId,
        depositDisposition,
        depositDispositionReason: depositDispositionReason || undefined,
        depositRefundAmountGbp:
          depositDisposition === "refund_partial" ? Number(depositRefundAmountGbp) : undefined,
        settlementResolution: needsSettlementStep ? settlementResolution : undefined,
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
    (!needsSettlementStep || settlementResolutions.includes(settlementResolution));

  return (
    <section className="rph-card space-y-4 border-amber-500/30 p-4">
      <div>
        <h2 className="text-sm font-semibold text-rph-fg">Resolve held deposit</h2>
        <p className="rph-muted mt-1 text-sm">{depositResolutionHelpText()}</p>
        <p className="mt-2 text-sm text-rph-fg">
          Deposit held: <span className="font-medium tabular-nums">{formatGbp(terminationSummary.depositGbp)}</span>
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
        <p className="text-rph-fg-secondary">After applying deposit:</p>
        <p className="mt-1 font-medium text-rph-fg">
          {settlementBalanceLabel(previewDirection, Math.abs(previewNetSettlement))}
        </p>
      </div>

      {needsSettlementStep ? (
        <div className="space-y-3 border-t border-rph-border pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-rph-fg" htmlFor="settlement-resolution">
              How to clear the balance
            </label>
            <RphSelect
              value={settlementResolution}
              aria-label="How to clear the balance"
              options={settlementResolutions.map((resolution) => ({
                value: resolution,
                label: settlementResolutionLabel(resolution),
              }))}
              onValueChange={(value) =>
                setSettlementResolution(value as HireSettlementResolution)
              }
            />
          </div>

          {settlementResolution === "paid_now" ? (
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

      <button
        type="button"
        className="rph-btn-primary"
        onClick={submit}
        disabled={pending || !canSubmit}
      >
        Resolve deposit — {hireDepositDispositionLabel(depositDisposition)}
      </button>
    </section>
  );
}
