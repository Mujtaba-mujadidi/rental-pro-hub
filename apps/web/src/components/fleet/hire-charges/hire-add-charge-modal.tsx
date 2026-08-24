"use client";

import { useState, useTransition } from "react";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import {
  addHireDriverChargeAction,
  amendHireDriverChargeAction,
} from "@/app/actions/hire-driver-charges";
import type {
  HireBalancePaymentAccountOption,
  HireDriverChargeWorkspaceRow,
} from "@/app/actions/rental-hire-termination";
import {
  STAFF_MANUAL_CHARGE_RESOLUTION_OPTIONS,
  STAFF_MANUAL_CHARGE_TYPE_OPTIONS,
  type StaffManualChargeResolution,
} from "@/lib/fleet/hire-driver-charge-mutation";
import {
  HIRE_PAYMENT_METHOD_LABELS,
} from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { ukTodayYmd } from "@/lib/datetime/uk";

export function HireAddChargeModal({
  hireGroupId,
  open,
  charge,
  headerMeta,
  paymentAccounts = [],
  defaultPaymentAccountId = null,
  onClose,
  onSaved,
}: {
  hireGroupId: string;
  open: boolean;
  charge?: HireDriverChargeWorkspaceRow | null;
  headerMeta?: string | null;
  paymentAccounts?: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return (
    <HireAddChargeForm
      key={charge?.id ?? "new"}
      hireGroupId={hireGroupId}
      charge={charge}
      headerMeta={headerMeta}
      paymentAccounts={paymentAccounts}
      defaultPaymentAccountId={defaultPaymentAccountId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function HireAddChargeForm({
  hireGroupId,
  charge,
  headerMeta,
  paymentAccounts,
  defaultPaymentAccountId: _defaultPaymentAccountId,
  onClose,
  onSaved,
}: {
  hireGroupId: string;
  charge?: HireDriverChargeWorkspaceRow | null;
  headerMeta?: string | null;
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const amending = Boolean(charge);
  const [amount, setAmount] = useState(charge ? charge.amountGbp.toFixed(2) : "");
  const [chargeType, setChargeType] = useState(charge?.chargeType ?? "damage");
  const [chargedOn, setChargedOn] = useState(charge?.chargedOn || ukTodayYmd());
  const [description, setDescription] = useState(charge?.description ?? "");
  const [resolution, setResolution] = useState<StaffManualChargeResolution>("add_to_balance");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const paidNow = !amending && resolution === "paid_now";
  const resolutionMeta = STAFF_MANUAL_CHARGE_RESOLUTION_OPTIONS.find((option) => option.value === resolution);

  const dirty =
    amount.trim() !== (charge ? charge.amountGbp.toFixed(2) : "") ||
    chargeType !== (charge?.chargeType ?? "damage") ||
    chargedOn !== (charge?.chargedOn || ukTodayYmd()) ||
    description.trim() !== (charge?.description ?? "") ||
    Boolean(reason.trim()) ||
    (!amending && resolution !== "add_to_balance") ||
    Boolean(paymentReference.trim());

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
    if (!amending && resolution === "paid_now") {
      if (!paymentMethod.trim()) {
        setError("Select a payment method.");
        return;
      }
      if (!paymentAccountId.trim()) {
        setError("Select the payment account this money was paid into.");
        return;
      }
      if (paymentAccounts.length === 0) {
        setError("Add a company payment account before recording a charged-now payment.");
        return;
      }
    }
    startTransition(async () => {
      const res =
        amending && charge
          ? await amendHireDriverChargeAction({
              hireGroupId,
              chargeLineItemId: charge.id,
              amountGbp,
              chargeType,
              chargedOnYmd: chargedOn,
              description,
              reason,
            })
          : await addHireDriverChargeAction({
              hireGroupId,
              amountGbp,
              chargeType,
              chargedOnYmd: chargedOn,
              description,
              resolution,
              ...(resolution === "paid_now"
                ? {
                    paymentMethod,
                    paymentAccountId: paymentAccountId || null,
                    paymentReference: paymentReference.trim() || null,
                  }
                : {}),
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  const titleNode = (
    <span className="block">
      {headerMeta ? (
        <span className="driver-dash-section-label mb-1 block normal-case tracking-[0.08em]">
          {headerMeta}
        </span>
      ) : null}
      <span>{amending ? "Amend charge" : "Add charge"}</span>
    </span>
  );

  return (
    <FormModalShell
      open
      titleId="hire-add-charge-title"
      title={titleNode}
      showDraftActions={false}
      allowMaximize={false}
      pending={pending}
      isDirty={dirty}
      maxWidthClass="max-w-xl"
      panelHeightClass="max-h-[min(90vh,40rem)]"
      onRequestClose={requestClose}
      discardConfirmOpen={discardOpen}
      onConfirmDiscard={onClose}
      onCancelDiscard={() => setDiscardOpen(false)}
      footer={
        <>
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${formModalBtnContinue} !bg-blue-600 hover:!bg-blue-700 dark:!bg-sky-500 dark:hover:!bg-sky-400 dark:!text-slate-950`}
            disabled={
              pending ||
              (paidNow && (!paymentMethod.trim() || !paymentAccountId.trim()))
            }
            onClick={submit}
          >
            {pending
              ? "Saving…"
              : amending
                ? "Save changes"
                : paidNow
                  ? "Charge & take payment"
                  : "Add to balance"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormModalField label="Amount">
          <input
            className="rph-input w-full tabular-nums"
            inputMode="decimal"
            placeholder="£0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Charge type">
          <FormModalSelect
            value={chargeType}
            aria-label="Charge type"
            options={STAFF_MANUAL_CHARGE_TYPE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onValueChange={setChargeType}
          />
        </FormModalField>
        <FormModalField label="Date" className="sm:col-span-2 sm:max-w-[12rem]">
          <input
            type="date"
            className="rph-input w-full"
            value={chargedOn}
            onChange={(event) => setChargedOn(event.target.value)}
          />
        </FormModalField>
        {!amending ? (
          <FormModalField label="Collection" className="sm:col-span-2">
            <FormModalSelect
              value={resolution}
              aria-label="Collection"
              options={STAFF_MANUAL_CHARGE_RESOLUTION_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onValueChange={(value) => setResolution(value as StaffManualChargeResolution)}
            />
            {resolutionMeta ? (
              <p className="mt-1.5 text-xs leading-relaxed text-rph-fg-secondary">{resolutionMeta.hint}</p>
            ) : null}
          </FormModalField>
        ) : null}
        {paidNow ? (
          <>
            <FormModalField label="Payment method">
              <FormModalSelect
                value={paymentMethod || "__none__"}
                aria-label="Payment method"
                options={[
                  { value: "__none__", label: "Select payment method" },
                  ...HIRE_DEPOSIT_REFUND_METHODS.map((value) => ({
                    value,
                    label: HIRE_PAYMENT_METHOD_LABELS[value],
                  })),
                ]}
                onValueChange={(value) => setPaymentMethod(value === "__none__" ? "" : value)}
              />
            </FormModalField>
            <FormModalField label="Paid into account">
              <FormModalSelect
                value={paymentAccountId || "__none__"}
                aria-label="Paid into account"
                options={[
                  { value: "__none__", label: "Select account" },
                  ...paymentAccounts.map((account) => ({
                    value: account.id,
                    label: account.isDefault ? `${account.name} (default)` : account.name,
                  })),
                ]}
                onValueChange={(value) => setPaymentAccountId(value === "__none__" ? "" : value)}
              />
              {paymentAccounts.length === 0 ? (
                <p className="mt-1.5 text-xs text-rph-fg-secondary">
                  No active payment accounts found for this company.
                </p>
              ) : null}
            </FormModalField>
            <FormModalField label="Payment reference (optional)" className="sm:col-span-2">
              <input
                className="rph-input w-full"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="Bank reference or receipt number"
              />
            </FormModalField>
          </>
        ) : null}
        <FormModalField label="Description" className="sm:col-span-2">
          <textarea
            className="rph-input min-h-[5.5rem] w-full text-sm"
            placeholder="Reason and supporting details"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormModalField>
        {amending ? (
          <FormModalField label="Reason for change" className="sm:col-span-2">
            <textarea
              className="rph-input min-h-20 w-full"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormModalField>
        ) : null}
        {error ? <p className="rph-alert-error sm:col-span-2 text-sm">{error}</p> : null}
      </div>
    </FormModalShell>
  );
}
