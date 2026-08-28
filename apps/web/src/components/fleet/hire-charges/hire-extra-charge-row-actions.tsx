"use client";

import type { ExtraChargePaymentTableRow } from "@/lib/fleet/hire-driver-charge-payment";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

const triggerClass =
  "hire-ws-payments-row-action-trigger inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

const contentClass =
  "z-[200] min-w-[11.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

export function HireExtraChargeRowActions({
  row,
  canMutate,
  canApprove,
  busy = false,
  onHistory,
  onEdit,
  onVoid,
  onReview,
  onAmend,
}: {
  row: ExtraChargePaymentTableRow;
  canMutate: boolean;
  canApprove: boolean;
  busy?: boolean;
  onHistory: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onReview: () => void;
  onAmend: () => void;
}) {
  const canReviewRow = canApprove && row.status === "pending_approval";
  const canVoidRow = canMutate && row.canVoid;
  const canEditRow = canMutate && row.canEdit;
  const canAmendPaid =
    canApprove &&
    row.paidGbp > 0.005 &&
    (row.status === "paid" || row.status === "partially_paid");

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={triggerClass}
          disabled={busy}
          aria-label="Extra charge actions"
          title="Actions"
        >
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={contentClass}
        >
          <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onHistory}>
            History
          </DropdownMenu.Item>
          {canReviewRow ? (
            <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onReview}>
              Review payment…
            </DropdownMenu.Item>
          ) : null}
          {canAmendPaid ? (
            <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onAmend}>
              Amend paid…
            </DropdownMenu.Item>
          ) : null}
          {canEditRow ? (
            <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onEdit}>
              Edit
            </DropdownMenu.Item>
          ) : null}
          {canVoidRow ? (
            <DropdownMenu.Item className={itemClass} disabled={busy} onSelect={onVoid}>
              Void…
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
