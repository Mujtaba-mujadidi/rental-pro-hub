"use client";

import { useState, useTransition } from "react";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { voidHireDriverChargeAction } from "@/app/actions/hire-driver-charges";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireVoidChargeModal({
  hireGroupId,
  charge,
  open,
  onClose,
  onVoided,
}: {
  hireGroupId: string;
  charge: HireDriverChargeWorkspaceRow | null;
  open: boolean;
  onClose: () => void;
  onVoided: () => void;
}) {
  if (!open || !charge) return null;
  return (
    <HireVoidChargeForm
      key={charge.id}
      hireGroupId={hireGroupId}
      charge={charge}
      onClose={onClose}
      onVoided={onVoided}
    />
  );
}

function HireVoidChargeForm({
  hireGroupId,
  charge,
  onClose,
  onVoided,
}: {
  hireGroupId: string;
  charge: HireDriverChargeWorkspaceRow;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function requestClose() {
    if (pending) return;
    if (reason.trim()) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function submit() {
    startTransition(async () => {
      const res = await voidHireDriverChargeAction({
        hireGroupId,
        chargeLineItemId: charge.id,
        reason,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onVoided();
      onClose();
    });
  }

  return (
    <FormModalShell
      open
      titleId="hire-void-charge-title"
      title="Void charge"
      description={`Void ${charge.chargeTypeLabel} ${formatGbp(charge.amountGbp)}. The charge stays on the account statement with a Voided status and no longer increases the amount owed.`}
      showDraftActions={false}
      pending={pending}
      isDirty={Boolean(reason.trim())}
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
            className={formModalBtnContinue}
            disabled={pending || !reason.trim()}
            onClick={submit}
          >
            {pending ? "Voiding…" : "Void charge"}
          </button>
        </>
      }
    >
      <FormModalField label="Reason">
        <textarea
          className="rph-input min-h-24 w-full"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormModalField>
      {error ? <p className="rph-alert-error mt-3 text-sm">{error}</p> : null}
    </FormModalShell>
  );
}
