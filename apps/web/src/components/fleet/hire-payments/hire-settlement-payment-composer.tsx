"use client";

import { recordHireBalancePaymentAction } from "@/app/actions/rental-hire-termination";
import type { HireBalancePaymentAccountOption } from "@/app/actions/rental-hire-termination";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  HIRE_PAYMENT_METHOD_LABELS,
  settlementPaymentMethodRequiresAccount,
} from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS, settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useCallback, useEffect, useState, useTransition } from "react";

function parseAmountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function HireSettlementPaymentComposer({
  hireGroupId,
  settlementBalance,
  paymentAccounts,
  defaultPaymentAccountId,
  submitLabel,
  triggerLabel = "Record payment",
  triggerClassName = "rph-btn-primary h-10 px-4",
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
  busy = false,
}: {
  hireGroupId: string;
  settlementBalance: HireWorkspaceSettlementBalance;
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  submitLabel?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  /** When true, only the modal is rendered — open it via `open` / `onOpenChange`. */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess: () => void;
  busy?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [maximized, setMaximized] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccountId, setPaymentAccountId] = useState(
    () =>
      defaultPaymentAccountId ??
      paymentAccounts.find((account) => account.isDefault)?.id ??
      paymentAccounts[0]?.id ??
      "",
  );
  const [paidOn, setPaidOn] = useState(ukTodayYmd());
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPending, startSubmit] = useTransition();

  const openBalanceGbp = Math.round(Math.max(0, settlementBalance.openBalanceGbp) * 100) / 100;
  const isRefund = settlementBalance.settlementDirection === "company_owes_driver";
  const resolvedSubmitLabel =
    submitLabel ?? (isRefund ? "Record refund" : "Record payment");
  const resolvedTriggerLabel = hideTrigger
    ? resolvedSubmitLabel
    : triggerLabel ?? resolvedSubmitLabel;
  const accountFieldLabel = isRefund ? "Paid from" : "Paid into";
  const outstandingLabel = settlementBalanceLabel(
    settlementBalance.settlementDirection,
    settlementBalance.openBalanceGbp,
  );

  const closeModal = useCallback(() => {
    setOpen(false);
    setMaximized(false);
    setDiscardOpen(false);
    setAmount("");
    setReference("");
    setPaymentMethod("bank_transfer");
    setPaymentAccountId(
      defaultPaymentAccountId ??
        paymentAccounts.find((account) => account.isDefault)?.id ??
        paymentAccounts[0]?.id ??
        "",
    );
    setPaidOn(ukTodayYmd());
    setNotes("");
    setSubmitError(null);
  }, [defaultPaymentAccountId, paymentAccounts, setOpen]);

  useEffect(() => {
    if (!open) return;
    setPaymentAccountId((current) => {
      if (current) return current;
      return (
        defaultPaymentAccountId ??
        paymentAccounts.find((account) => account.isDefault)?.id ??
        paymentAccounts[0]?.id ??
        ""
      );
    });
    setAmount((current) => {
      if (current.trim()) return current;
      return openBalanceGbp > 0.005 ? openBalanceGbp.toFixed(2) : current;
    });
  }, [defaultPaymentAccountId, open, openBalanceGbp, paymentAccounts]);

  const dirty =
    Boolean(amount.trim()) ||
    Boolean(reference.trim()) ||
    Boolean(notes.trim()) ||
    paymentMethod !== "bank_transfer" ||
    paidOn !== ukTodayYmd();

  const requestClose = useCallback(() => {
    if (submitPending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    closeModal();
  }, [closeModal, dirty, submitPending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitPending && !discardOpen) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [discardOpen, open, requestClose, submitPending]);

  function openModal() {
    setSubmitError(null);
    if (!amount.trim() && openBalanceGbp > 0.005) {
      setAmount(openBalanceGbp.toFixed(2));
    }
    setOpen(true);
  }

  function handleSubmit() {
    const parsed = parseAmountInput(amount);
    if (!parsed) {
      setSubmitError("Enter a valid payment amount.");
      return;
    }
    if (parsed - openBalanceGbp > 0.005) {
      setSubmitError(
        `Amount exceeds the open balance (${formatGbp(openBalanceGbp)}). Reduce the amount.`,
      );
      return;
    }
    if (settlementPaymentMethodRequiresAccount(paymentMethod) && !paymentAccountId) {
      setSubmitError(
        isRefund
          ? "Select the payment account this money was paid from."
          : "Select the payment account this money was paid into.",
      );
      return;
    }
    setSubmitError(null);
    startSubmit(async () => {
      const res = await recordHireBalancePaymentAction({
        hireGroupId,
        amountGbp: parsed,
        paymentMethod,
        paymentAccountId: settlementPaymentMethodRequiresAccount(paymentMethod)
          ? paymentAccountId
          : null,
        paymentReference: reference,
        paidOnYmd: paidOn,
        notes,
      });
      if (!res.ok) {
        setSubmitError(res.error ?? "Could not record payment.");
        return;
      }
      closeModal();
      onSuccess();
    });
  }

  const fieldsDisabled = busy || submitPending || settlementBalance.settled;
  const parsedAmount = parseAmountInput(amount);
  const submitDisabled =
    fieldsDisabled ||
    parsedAmount == null ||
    openBalanceGbp <= 0.005 ||
    (parsedAmount != null && parsedAmount - openBalanceGbp > 0.005) ||
    (settlementPaymentMethodRequiresAccount(paymentMethod) && !paymentAccountId);
  const triggerDisabled = fieldsDisabled || openBalanceGbp <= 0.005;

  const description = isRefund
    ? `Record money paid back to the driver against the confirmed settlement balance (${outstandingLabel}).`
    : `Record money received from the driver against the confirmed settlement balance (${outstandingLabel}).`;

  const fields = (
    <div className="space-y-4">
      <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
        <p className="font-medium text-rph-fg">Open balance</p>
        <p className="mt-0.5 tabular-nums text-rph-fg-secondary">{outstandingLabel}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FormModalField label="Amount (£)" className="min-w-[10rem] flex-1">
          <input
            className="rph-input w-full tabular-nums"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            disabled={fieldsDisabled}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormModalField>
        <button
          type="button"
          className="rph-btn-ghost h-10 shrink-0 px-3 text-xs"
          disabled={fieldsDisabled || openBalanceGbp <= 0}
          onClick={() => {
            setAmount(openBalanceGbp.toFixed(2));
            setSubmitError(null);
          }}
        >
          {isRefund ? "Pay remaining" : "Pay remaining balance"} ({formatGbp(openBalanceGbp)})
        </button>
      </div>

      <FormModalField label="Payment reference (optional)">
        <input
          className="rph-input w-full"
          value={reference}
          disabled={fieldsDisabled}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Bank reference or note"
        />
      </FormModalField>

      <FormModalField label="Payment method">
        <FormModalSelect
          value={paymentMethod}
          aria-label="Payment method"
          disabled={fieldsDisabled}
          options={HIRE_DEPOSIT_REFUND_METHODS.map((value) => ({
            value,
            label: HIRE_PAYMENT_METHOD_LABELS[value],
          }))}
          onValueChange={(value) => {
            setPaymentMethod(value);
            if (!settlementPaymentMethodRequiresAccount(value)) setPaymentAccountId("");
          }}
        />
      </FormModalField>

      {settlementPaymentMethodRequiresAccount(paymentMethod) ? (
        <FormModalField label={accountFieldLabel}>
          <FormModalSelect
            value={paymentAccountId || "__none__"}
            aria-label={accountFieldLabel}
            disabled={fieldsDisabled}
            options={[
              { value: "__none__", label: "Select payment account…" },
              ...paymentAccounts.map((account) => ({
                value: account.id,
                label: `${account.name}${account.isDefault ? " (hire default)" : ""}`,
              })),
            ]}
            onValueChange={(value) => setPaymentAccountId(value === "__none__" ? "" : value)}
          />
        </FormModalField>
      ) : (
        <p className="rph-muted text-xs">No bank account needed for cash payments.</p>
      )}

      {settlementPaymentMethodRequiresAccount(paymentMethod) && !paymentAccounts.length ? (
        <p className="rph-muted text-xs">No active payment accounts. Add one in rental settings.</p>
      ) : null}

      <FormModalField label="Date">
        <input
          type="date"
          className="rph-input w-full"
          value={paidOn}
          disabled={fieldsDisabled}
          onChange={(e) => setPaidOn(e.target.value)}
        />
      </FormModalField>

      <FormModalField label="Description (optional)">
        <textarea
          className="rph-input min-h-20 w-full"
          value={notes}
          disabled={fieldsDisabled}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormModalField>

      {submitError ? <p className="rph-alert-error text-sm">{submitError}</p> : null}
    </div>
  );

  return (
    <>
      {!hideTrigger ? (
        <button
          type="button"
          className={triggerClassName}
          disabled={triggerDisabled}
          onClick={openModal}
        >
          {resolvedTriggerLabel}
        </button>
      ) : null}

      <FormModalShell
        open={open}
        titleId="hire-settlement-payment-modal-title"
        title={resolvedSubmitLabel}
        description={description}
        showDraftActions={false}
        allowMaximize
        pending={submitPending}
        pendingMessage="Submitting…"
        isDirty={dirty}
        onRequestClose={requestClose}
        onMaximizedChange={setMaximized}
        discardConfirmOpen={discardOpen}
        onConfirmDiscard={closeModal}
        onCancelDiscard={() => setDiscardOpen(false)}
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button type="button" className={formModalBtnGhost} disabled={fieldsDisabled} onClick={requestClose}>
              Cancel
            </button>
            <button
              type="button"
              className={formModalBtnContinue}
              disabled={submitDisabled}
              onClick={handleSubmit}
            >
              {submitPending ? "Submitting…" : resolvedSubmitLabel}
            </button>
          </>
        }
      >
        {maximized ? <div className="max-w-xl">{fields}</div> : fields}
      </FormModalShell>
    </>
  );
}
