"use client";

import { RphSelect } from "@/components/forms/rph-select";
import {
  previewHireDepositResolutionAction,
} from "@/app/actions/rental-hire-termination";
import type { HireDepositFinalizePayload } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import type { DepositResolutionPreview } from "@/lib/fleet/hire-deposit-resolution";
import { openBalanceDirection } from "@/lib/fleet/hire-open-balance";
import {
  settlementResolutionLabel,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  settlementBalanceLabel,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";
import { useEffect, useMemo, useState, useTransition } from "react";

const HOLD_DEPOSIT_REASONS = [
  { value: "Charge disputed", label: "Charge disputed" },
  { value: "Evidence under review", label: "Evidence under review" },
  { value: "Management review", label: "Management review" },
] as const;

const REFUND_WHILE_BALANCE_OPEN_REASONS = [
  { value: "Deposit paid by third party", label: "Deposit paid by third party" },
  { value: "Contract or legal exception", label: "Contract or legal exception" },
  { value: "Management decision", label: "Management decision" },
] as const;

type EndHireDepositChoice = "apply_to_balance" | "hold_pending" | "refund_full";

function endHireDepositChoiceLabel(
  choice: EndHireDepositChoice,
  depositHeldGbp: number,
): string {
  if (choice === "apply_to_balance") return `Apply ${formatGbp(depositHeldGbp)} to the balance`;
  if (choice === "hold_pending") return "Hold deposit pending review";
  return "Refund while balance remains open";
}

export function HireEndHireDepositPositionPanel({
  hireGroupId,
  depositRequiredGbp,
  depositHeldGbp,
  driverBalanceBeforeDepositGbp,
  onFinalizePayloadChange,
}: {
  hireGroupId: string;
  depositRequiredGbp: number;
  depositHeldGbp: number;
  driverBalanceBeforeDepositGbp: number;
  onFinalizePayloadChange: (payload: HireDepositFinalizePayload | null) => void;
}) {
  const [previewPending, startPreviewTransition] = useTransition();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DepositResolutionPreview | null>(null);
  const [depositChoice, setDepositChoice] = useState<EndHireDepositChoice>(() =>
    driverBalanceBeforeDepositGbp > 0.005 ? "apply_to_balance" : "hold_pending",
  );
  const [holdReason, setHoldReason] = useState("");
  const [holdReviewDateYmd, setHoldReviewDateYmd] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("bank_transfer");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [settlementResolution, setSettlementResolution] = useState<HireSettlementResolution>("open_balance");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("bank_transfer");
  const [settlementPaymentReference, setSettlementPaymentReference] = useState("");

  const heldGbp = Math.max(0, Number(depositHeldGbp) || 0);
  const driverOwes = driverBalanceBeforeDepositGbp > 0.005;

  useEffect(() => {
    if (depositChoice === "hold_pending") {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    startPreviewTransition(async () => {
      setPreviewError(null);
      const res = await previewHireDepositResolutionAction({
        hireGroupId,
        depositDisposition: depositChoice,
      });
      if (!res.ok) {
        setPreview(null);
        setPreviewError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }, [hireGroupId, depositChoice, driverBalanceBeforeDepositGbp, depositHeldGbp]);

  const depositOptions = preview?.depositOptions ?? [];
  const selectedAllowed =
    depositChoice === "hold_pending" ||
    Boolean(depositOptions.find((option) => option.value === depositChoice)?.allowed);

  const needsSettlementStep = preview?.needsSettlementStep ?? false;
  const effectiveSettlementResolution =
    preview && preview.settlementResolutions.includes(settlementResolution)
      ? settlementResolution
      : (preview?.settlementResolutions[0] ?? "open_balance");

  const afterSigned =
    depositChoice === "hold_pending"
      ? driverBalanceBeforeDepositGbp
      : depositChoice === "apply_to_balance"
        ? roundGbp(Math.max(0, driverBalanceBeforeDepositGbp - heldGbp))
        : (preview?.afterSignedSettlementGbp ?? driverBalanceBeforeDepositGbp);

  const afterDirection = openBalanceDirection(afterSigned);

  const reasonValid =
    depositChoice === "apply_to_balance"
      ? true
      : depositChoice === "hold_pending"
        ? holdReason.trim().length > 0 && holdReviewDateYmd.trim().length > 0
        : refundReason.trim().length > 0;

  const canSubmit =
    selectedAllowed &&
    reasonValid &&
    confirmed &&
    (depositChoice === "hold_pending" || (preview != null && !previewPending));

  const depositDispositionReason = useMemo(() => {
    if (depositChoice === "hold_pending") {
      const parts = [holdReason.trim()];
      if (holdReviewDateYmd.trim()) parts.push(`Review by ${holdReviewDateYmd.trim()}`);
      return parts.filter(Boolean).join(" · ");
    }
    if (depositChoice === "refund_full") {
      const parts = [refundReason.trim(), refundNotes.trim()].filter(Boolean);
      return parts.join(" · ");
    }
    return undefined;
  }, [depositChoice, holdReason, holdReviewDateYmd, refundReason, refundNotes]);

  useEffect(() => {
    if (!canSubmit) {
      onFinalizePayloadChange(null);
      return;
    }
    onFinalizePayloadChange({
      depositDisposition: depositChoice,
      depositDispositionReason:
        depositChoice === "apply_to_balance"
          ? "Applied to final account balance"
          : depositDispositionReason,
      settlementResolution: needsSettlementStep ? effectiveSettlementResolution : undefined,
      settlementPaymentMethod:
        needsSettlementStep && effectiveSettlementResolution === "paid_now"
          ? settlementPaymentMethod
          : depositChoice === "refund_full"
            ? refundMethod
            : undefined,
      settlementPaymentReference:
        needsSettlementStep && effectiveSettlementResolution === "paid_now"
          ? settlementPaymentReference.trim() || undefined
          : undefined,
    });
  }, [
    canSubmit,
    onFinalizePayloadChange,
    depositChoice,
    depositDispositionReason,
    needsSettlementStep,
    effectiveSettlementResolution,
    settlementPaymentMethod,
    settlementPaymentReference,
    refundMethod,
  ]);

  const choices: EndHireDepositChoice[] = driverOwes
    ? ["apply_to_balance", "hold_pending", "refund_full"]
    : ["apply_to_balance", "refund_full"];

  return (
    <article className="rph-panel flex h-full flex-col p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="driver-dash-section-label">Deposit position</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-rph-fg">
            Choose how to handle the deposit
          </h3>
        </div>
        <span className="rph-pill border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          Review required
        </span>
      </header>

      <dl className="mt-4 space-y-2 border-b border-rph-border pb-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">Deposit required by contract</dt>
          <dd className="font-medium tabular-nums text-rph-fg">
            {formatGbp(depositRequiredGbp)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">Deposit actually received</dt>
          <dd className="font-medium tabular-nums text-rph-fg">{formatGbp(heldGbp)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">Driver balance before deposit</dt>
          <dd className="font-medium tabular-nums text-rph-fg">
            {formatGbp(driverBalanceBeforeDepositGbp)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        {choices.map((choice) => {
          const selected = depositChoice === choice;
          const badge =
            choice === "apply_to_balance"
              ? { label: `Balance ${formatGbp(Math.max(0, afterSigned))}`, tone: "success" as const }
              : choice === "hold_pending"
                ? {
                    label: `Owes ${formatGbp(driverBalanceBeforeDepositGbp)}`,
                    tone: "warn" as const,
                  }
                : { label: "Admin only", tone: "danger" as const };

          return (
            <label
              key={choice}
              className={`block cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                selected
                  ? "border-sky-400 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/25"
                  : "border-rph-border bg-rph-page/40 hover:bg-rph-page/70"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="end-hire-deposit-choice"
                  className="mt-1"
                  checked={selected}
                  onChange={() => {
                    setDepositChoice(choice);
                    setConfirmed(false);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-rph-fg">
                      {endHireDepositChoiceLabel(choice, heldGbp)}
                    </p>
                    <span
                      className={`rph-pill shrink-0 text-xs ${
                        badge.tone === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                          : badge.tone === "warn"
                            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
                            : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
                      }`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  {choice === "apply_to_balance" ? (
                    <p className="mt-1 text-xs text-rph-fg-secondary">
                      Recommended when the driver still owes money. Up to {formatGbp(heldGbp)} can be
                      applied to the open balance.
                    </p>
                  ) : choice === "hold_pending" ? (
                    <p className="mt-1 text-xs text-rph-fg-secondary">
                      Keep {formatGbp(heldGbp)} ring-fenced. It does not reduce the driver debt.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-rph-fg-secondary">
                      Admin exception — the refund does not clear or reduce the debt.
                    </p>
                  )}
                </div>
              </div>

              {selected && choice === "hold_pending" ? (
                <div className="mt-3 grid gap-3 border-t border-rph-border/70 pt-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-rph-fg" htmlFor="hold-reason">
                      Reason
                    </label>
                    <RphSelect
                      value={holdReason || "placeholder"}
                      aria-label="Reason for holding deposit"
                      options={[
                        { value: "placeholder", label: "Select a reason", disabled: true },
                        ...HOLD_DEPOSIT_REASONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        })),
                      ]}
                      onValueChange={(value) => {
                        if (value === "placeholder") return;
                        setHoldReason(value);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-rph-fg" htmlFor="hold-review-date">
                      Review date
                    </label>
                    <input
                      id="hold-review-date"
                      type="date"
                      className="rph-input w-full"
                      value={holdReviewDateYmd}
                      onChange={(event) => setHoldReviewDateYmd(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {selected && choice === "refund_full" ? (
                <div className="mt-3 space-y-3 border-t border-rph-border/70 pt-3">
                  <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-100">
                    This is an exception where the driver is refunded while the debt remains open.
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-rph-fg" htmlFor="refund-reason">
                        Admin reason
                      </label>
                      <RphSelect
                        value={refundReason || "placeholder"}
                        aria-label="Admin reason for refund"
                        options={[
                          { value: "placeholder", label: "Select a reason", disabled: true },
                          ...REFUND_WHILE_BALANCE_OPEN_REASONS.map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]}
                        onValueChange={(value) => {
                          if (value === "placeholder") return;
                          setRefundReason(value);
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-rph-fg" htmlFor="refund-method">
                        Refund method
                      </label>
                      <RphSelect
                        value={refundMethod}
                        aria-label="Refund method"
                        options={HIRE_DEPOSIT_REFUND_METHODS.map((method) => ({
                          value: method,
                          label: method.replace(/_/g, " "),
                        }))}
                        onValueChange={setRefundMethod}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-rph-fg" htmlFor="refund-notes">
                      Notes (optional)
                    </label>
                    <textarea
                      id="refund-notes"
                      className="rph-input min-h-16 w-full"
                      value={refundNotes}
                      onChange={(event) => setRefundNotes(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </label>
          );
        })}
      </div>

      {previewError ? <p className="mt-3 text-sm text-rph-fg-secondary">{previewError}</p> : null}

      {needsSettlementStep && preview && depositChoice !== "hold_pending" ? (
        <div className="mt-4 space-y-3 border-t border-rph-border pt-4">
          <div className="space-y-1.5">
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
              onValueChange={(value) => setSettlementResolution(value as HireSettlementResolution)}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            <span className="text-sm font-semibold text-rph-fg">Confirm this deposit decision</span>
            <span className="mt-1 block text-xs text-rph-fg-secondary">
              I understand this creates an audited financial action and cannot be silently edited
              later.
            </span>
          </span>
        </label>
      </div>

      <button
        type="button"
        className="rph-btn-primary mt-4 h-11 w-full"
        disabled={!canSubmit}
      >
        {depositChoice === "apply_to_balance"
          ? `Apply ${formatGbp(heldGbp)} deposit`
          : depositChoice === "hold_pending"
            ? "Hold deposit pending review"
            : `Authorise ${formatGbp(heldGbp)} refund`}
      </button>
      <p className="mt-2 text-center text-xs text-rph-fg-muted">
        No deposit is applied or refunded until this action is confirmed.
      </p>
      {depositChoice !== "hold_pending" && preview ? (
        <p className="sr-only">
          After deposit action: {settlementBalanceLabel(afterDirection, Math.abs(afterSigned))}
        </p>
      ) : null}
    </article>
  );
}
