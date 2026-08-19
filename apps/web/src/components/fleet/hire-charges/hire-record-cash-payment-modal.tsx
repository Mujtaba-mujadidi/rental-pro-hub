"use client";

import { useState } from "react";
import type { HireBalancePaymentAccountOption } from "@/app/actions/rental-hire-termination";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import {
  HIRE_PAYMENT_METHOD_LABELS,
  settlementPaymentMethodRequiresAccount,
} from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";

export type HireRecordCashPaymentValues = {
  amountGbp: number;
  paymentMethod: string;
  paymentAccountId: string | null;
  paidOnYmd: string;
  paymentReference: string;
  notes: string;
};

export function HireRecordCashPaymentModal({
  open,
  title = "Record payment",
  description,
  amountLabel = "Amount (£)",
  defaultAmountGbp,
  paymentAccounts,
  defaultPaymentAccountId,
  pending = false,
  error = null,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title?: string;
  description?: string | null;
  amountLabel?: string;
  defaultAmountGbp?: number | null;
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: HireRecordCashPaymentValues) => Promise<void> | void;
}) {
  if (!open) return null;
  return (
    <HireRecordCashPaymentForm
      title={title}
      description={description}
      amountLabel={amountLabel}
      defaultAmountGbp={defaultAmountGbp}
      paymentAccounts={paymentAccounts}
      defaultPaymentAccountId={defaultPaymentAccountId}
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function HireRecordCashPaymentForm({
  title,
  description,
  amountLabel,
  defaultAmountGbp,
  paymentAccounts,
  defaultPaymentAccountId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string | null;
  amountLabel: string;
  defaultAmountGbp?: number | null;
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: HireRecordCashPaymentValues) => Promise<void> | void;
}) {
  const [amount, setAmount] = useState(
    defaultAmountGbp && defaultAmountGbp > 0 ? defaultAmountGbp.toFixed(2) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccountId, setPaymentAccountId] = useState(
    defaultPaymentAccountId ?? paymentAccounts[0]?.id ?? "",
  );
  const [paidOn, setPaidOn] = useState(ukTodayYmd());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const showAccount = settlementPaymentMethodRequiresAccount(paymentMethod);
  const dirty = Boolean(amount.trim() || reference.trim() || notes.trim());

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function submit() {
    const amountGbp = Number(amount);
    if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
      setLocalError("Enter a valid amount.");
      return;
    }
    if (showAccount && !paymentAccountId) {
      setLocalError("Select the payment account this money was paid into.");
      return;
    }
    setLocalError(null);
    void onSubmit({
      amountGbp,
      paymentMethod,
      paymentAccountId: showAccount ? paymentAccountId : null,
      paidOnYmd: paidOn,
      paymentReference: reference,
      notes,
    });
  }

  return (
    <FormModalShell
      open
      titleId="hire-record-cash-title"
      title={title}
      description={description ?? undefined}
      showDraftActions={false}
      pending={pending}
      isDirty={dirty}
      onRequestClose={requestClose}
      discardConfirmOpen={discardOpen}
      onConfirmDiscard={onClose}
      onCancelDiscard={() => setDiscardOpen(false)}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <button type="button" className={formModalBtnContinue} disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Record payment"}
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormModalField label={amountLabel}>
          <input
            className="rph-input w-full tabular-nums"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Payment method">
          <FormModalSelect
            value={paymentMethod}
            aria-label="Payment method"
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
        {showAccount ? (
          <FormModalField label="Paid into" className="sm:col-span-2">
            <FormModalSelect
              value={paymentAccountId || "__none__"}
              aria-label="Paid into account"
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
          <p className="rph-muted sm:col-span-2 text-xs">No bank account needed for cash payments.</p>
        )}
        <FormModalField label="Date">
          <input
            type="date"
            className="rph-input w-full"
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Reference (optional)">
          <input
            className="rph-input w-full"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Description (optional)" className="sm:col-span-2">
          <textarea
            className="rph-input min-h-20 w-full"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormModalField>
        {localError || error ? (
          <p className="rph-alert-error sm:col-span-2 text-sm">{localError ?? error}</p>
        ) : null}
        {defaultAmountGbp && defaultAmountGbp > 0.005 ? (
          <p className="rph-muted sm:col-span-2 text-xs">Currently owed: {formatGbp(defaultAmountGbp)}</p>
        ) : null}
      </div>
    </FormModalShell>
  );
}
