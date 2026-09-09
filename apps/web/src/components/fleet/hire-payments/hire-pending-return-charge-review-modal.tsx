"use client";

import { useState, useTransition } from "react";
import { resolveHirePendingReturnChargeAction } from "@/app/actions/hire-return-charges";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import type { HireEndedPendingChargeReview } from "@/lib/fleet/hire-ended-balance-case";
import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";

export function HirePendingReturnChargeReviewModal({
  open,
  hireGroupId,
  review,
  confirmedBalanceGbp,
  onClose,
  onSuccess,
}: {
  open: boolean;
  hireGroupId: string;
  review: HireEndedPendingChargeReview | null;
  confirmedBalanceGbp: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (!open || !review) return null;
  return (
    <HirePendingReturnChargeReviewForm
      key={review.id}
      hireGroupId={hireGroupId}
      review={review}
      confirmedBalanceGbp={confirmedBalanceGbp}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function HirePendingReturnChargeReviewForm({
  hireGroupId,
  review,
  confirmedBalanceGbp,
  onClose,
  onSuccess,
}: {
  hireGroupId: string;
  review: HireEndedPendingChargeReview;
  confirmedBalanceGbp: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const proposedGbp =
    review.proposedGbp != null && review.proposedGbp > 0.005 ? review.proposedGbp : null;
  const [decision, setDecision] = useState<"approve" | "waive">("approve");
  const [amount, setAmount] = useState(proposedGbp != null ? proposedGbp.toFixed(2) : "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0.005;
  const projectedGbp =
    decision === "approve" && amountValid
      ? roundGbp(confirmedBalanceGbp + amountNumber)
      : confirmedBalanceGbp;
  const notesRequired = decision === "waive";
  const dirty =
    decision !== "approve" ||
    Boolean(notes.trim()) ||
    (decision === "approve" && amount !== (proposedGbp != null ? proposedGbp.toFixed(2) : ""));
  const canSave =
    decision === "waive"
      ? Boolean(notes.trim())
      : amountValid && (!notesRequired || Boolean(notes.trim()));

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function submit() {
    startTransition(async () => {
      setError(null);
      const res = await resolveHirePendingReturnChargeAction({
        hireGroupId,
        reviewId: review.id,
        decision,
        amountGbp: decision === "approve" ? Number(amount) : proposedGbp ?? undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
      onClose();
    });
  }

  const kindLabel =
    review.kind === "damage"
      ? "Damage"
      : review.kind === "fuel"
        ? "Fuel"
        : review.kind === "accessory"
          ? "Accessory"
          : "Charge";

  const description =
    decision === "waive"
      ? "No charge is added to the balance; the item stays on Charges as Waived."
      : "Confirm the amount to add to the confirmed balance.";

  return (
    <FormModalShell
      open
      titleId="hire-pending-return-charge-review-title"
      title="Review return charge"
      description={description}
      showDraftActions={false}
      pending={pending}
      pendingMessage="Saving…"
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
          <button
            type="button"
            className={formModalBtnContinue}
            disabled={pending || !canSave}
            onClick={submit}
          >
            {pending ? "Saving…" : "Save decision"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-rph-rail/25 bg-rph-rail/5 px-3 py-3 dark:border-rph-rail-soft/30 dark:bg-rph-rail-soft/10">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-rail dark:text-rph-rail-soft">
            {kindLabel}
          </p>
          <p className="mt-0.5 text-base font-semibold text-rph-fg">{review.label}</p>
          {review.detail ? (
            <p className="mt-1 text-sm text-rph-fg-secondary">{review.detail}</p>
          ) : null}
        </div>

        <FormModalField label="Action">
          <FormModalSelect
            value={decision}
            aria-label="Review action"
            options={[
              { value: "approve", label: "Approve — add to balance" },
              { value: "waive", label: "Waive — no charge to driver" },
            ]}
            onValueChange={(value) => setDecision(value as "approve" | "waive")}
          />
        </FormModalField>

        {decision === "approve" ? (
          <FormModalField label="Amount to charge (£)">
            <input
              className="rph-input w-full tabular-nums"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
              placeholder="0.00"
            />
          </FormModalField>
        ) : null}

        <FormModalField label={notesRequired ? "Notes" : "Notes (optional)"}>
          <textarea
            className="rph-input min-h-24 w-full"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={pending}
            placeholder={
              notesRequired
                ? "Explain why this charge is waived"
                : "Optional note for the charge record"
            }
          />
        </FormModalField>

        {decision === "approve" ? (
          <p className="text-sm text-rph-fg-secondary">
            After save, confirmed balance{" "}
            <span className="font-semibold tabular-nums text-rph-fg">{formatGbp(projectedGbp)}</span>
          </p>
        ) : (
          <p className="text-sm text-rph-fg-secondary">
            After save, this shows as Waived on Charges · balance unchanged.
          </p>
        )}

        {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      </div>
    </FormModalShell>
  );
}
