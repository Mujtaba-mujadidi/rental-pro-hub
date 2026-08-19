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
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { STAFF_MANUAL_CHARGE_TYPE_OPTIONS } from "@/lib/fleet/hire-driver-charge-mutation";
import { ukTodayYmd } from "@/lib/datetime/uk";

export function HireAddChargeModal({
  hireGroupId,
  open,
  charge,
  headerMeta,
  onClose,
  onSaved,
}: {
  hireGroupId: string;
  open: boolean;
  charge?: HireDriverChargeWorkspaceRow | null;
  headerMeta?: string | null;
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
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function HireAddChargeForm({
  hireGroupId,
  charge,
  headerMeta,
  onClose,
  onSaved,
}: {
  hireGroupId: string;
  charge?: HireDriverChargeWorkspaceRow | null;
  headerMeta?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const amending = Boolean(charge);
  const [amount, setAmount] = useState(charge ? charge.amountGbp.toFixed(2) : "");
  const [chargeType, setChargeType] = useState(charge?.chargeType ?? "damage");
  const [chargedOn, setChargedOn] = useState(charge?.chargedOn || ukTodayYmd());
  const [description, setDescription] = useState(charge?.description ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    amount.trim() !== (charge ? charge.amountGbp.toFixed(2) : "") ||
    chargeType !== (charge?.chargeType ?? "damage") ||
    chargedOn !== (charge?.chargedOn || ukTodayYmd()) ||
    description.trim() !== (charge?.description ?? "") ||
    Boolean(reason.trim());

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
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <FormModalShell
      open
      titleId="hire-add-charge-title"
      title={amending ? "Amend charge" : "Add charge"}
      description={headerMeta ?? "Add an extra charge to this hire."}
      showDraftActions={false}
      allowMaximize
      pending={pending}
      isDirty={dirty}
      onRequestClose={requestClose}
      discardConfirmOpen={discardOpen}
      onConfirmDiscard={onClose}
      onCancelDiscard={() => setDiscardOpen(false)}
      footer={
        <>
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <button type="button" className={formModalBtnContinue} disabled={pending} onClick={submit}>
            {pending ? "Saving…" : amending ? "Save changes" : "Add charge"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormModalField label="Amount (£)">
          <input
            className="rph-input w-full tabular-nums"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Type">
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
        <FormModalField label="Date">
          <input
            type="date"
            className="rph-input w-full"
            value={chargedOn}
            onChange={(event) => setChargedOn(event.target.value)}
          />
        </FormModalField>
        <FormModalField label="Description" className="sm:col-span-2">
          <input
            className="rph-input w-full"
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
