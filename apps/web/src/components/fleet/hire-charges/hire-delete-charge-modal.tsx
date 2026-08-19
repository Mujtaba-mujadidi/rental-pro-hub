"use client";

import { useState, useTransition } from "react";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { deleteHireDriverChargeAction } from "@/app/actions/hire-driver-charges";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireDeleteChargeModal({
  hireGroupId,
  charge,
  open,
  onClose,
  onDeleted,
}: {
  hireGroupId: string;
  charge: HireDriverChargeWorkspaceRow | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  if (!open || !charge) return null;
  return (
    <HireDeleteChargeForm
      key={charge.id}
      hireGroupId={hireGroupId}
      charge={charge}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

function HireDeleteChargeForm({
  hireGroupId,
  charge,
  onClose,
  onDeleted,
}: {
  hireGroupId: string;
  charge: HireDriverChargeWorkspaceRow;
  onClose: () => void;
  onDeleted: () => void;
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
      const res = await deleteHireDriverChargeAction({
        hireGroupId,
        chargeLineItemId: charge.id,
        reason,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDeleted();
      onClose();
    });
  }

  return (
    <FormModalShell
      open
      titleId="hire-delete-charge-title"
      title="Delete charge"
      description={`Remove ${charge.chargeTypeLabel} ${formatGbp(charge.amountGbp)}. This cannot be undone.`}
      showDraftActions={false}
      pending={pending}
      isDirty={Boolean(reason.trim())}
      onRequestClose={requestClose}
      discardConfirmOpen={discardOpen}
      onConfirmDiscard={onClose}
      onCancelDiscard={() => setDiscardOpen(false)}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className={formModalBtnContinue}
            disabled={pending || !reason.trim()}
            onClick={submit}
          >
            {pending ? "Deleting…" : "Delete charge"}
          </button>
        </div>
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
