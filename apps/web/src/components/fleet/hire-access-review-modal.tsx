"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { HireAccessDetail } from "@/components/fleet/hire-access-detail";
import { hireAccessApproveConfirmCopy, hireAccessRejectConfirmCopy } from "@/lib/fleet/hire-audit";
import type { HireAccessDisplay } from "@/lib/fleet/hire-access-display";

type Props = {
  open: boolean;
  pending?: boolean;
  title: string;
  companyName: string;
  status: string;
  display: HireAccessDisplay | null;
  loading?: boolean;
  loadError?: string | null;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
};

export function HireAccessReviewModal({
  open,
  pending = false,
  title,
  companyName,
  status,
  display,
  loading = false,
  loadError = null,
  onClose,
  onApprove,
  onReject,
}: Props) {
  const isPending = status === "pending";
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  const company = display?.companyName ?? companyName;

  return (
    <>
      <FormModalShell
        open={open}
        titleId="hire-access-review-title"
        title={title}
        description="Review the rental company, vehicle, hire terms, and conditions before you respond."
        allowMaximize
        showDraftActions={false}
        pending={pending || loading}
        maxWidthClass="max-w-4xl"
        panelHeightClass="h-[min(92vh,56rem)]"
        onRequestClose={onClose}
        discardConfirmOpen={false}
        onConfirmDiscard={onClose}
        onCancelDiscard={onClose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {isPending && onApprove ? (
              <button
                type="button"
                className="rph-btn-primary h-9 px-4 text-sm"
                disabled={pending || loading || !display}
                onClick={() => setApproveConfirmOpen(true)}
              >
                Approve access
              </button>
            ) : null}
            {isPending && onReject ? (
              <button
                type="button"
                className="rph-btn-ghost h-9 px-4 text-sm"
                disabled={pending || loading || !display}
                onClick={() => setRejectConfirmOpen(true)}
              >
                Reject
              </button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
            <p className="text-sm text-rph-fg-secondary">Loading hire details…</p>
          </div>
        ) : loadError ? (
          <p className="rph-alert-error text-sm">{loadError}</p>
        ) : display ? (
          <HireAccessDetail display={display} />
        ) : null}
      </FormModalShell>

      <ConfirmDialog
        open={approveConfirmOpen}
        title="Approve profile access?"
        description={hireAccessApproveConfirmCopy(company)}
        confirmLabel="Yes, approve access"
        cancelLabel="Go back"
        pending={pending}
        onCancel={() => setApproveConfirmOpen(false)}
        onConfirm={() => {
          setApproveConfirmOpen(false);
          onApprove?.();
        }}
      />

      <ConfirmDialog
        open={rejectConfirmOpen}
        title="Reject hire request?"
        description={hireAccessRejectConfirmCopy(company)}
        confirmLabel="Reject request"
        cancelLabel="Go back"
        variant="danger"
        pending={pending}
        onCancel={() => setRejectConfirmOpen(false)}
        onConfirm={() => {
          setRejectConfirmOpen(false);
          onReject?.();
        }}
      />
    </>
  );
}
