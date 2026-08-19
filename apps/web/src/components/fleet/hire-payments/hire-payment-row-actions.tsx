"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  approveHirePaymentRowAction,
  recordStaffHirePaymentRowAction,
} from "@/app/actions/hire-payments";
import { HirePaymentAmendModal } from "@/components/fleet/hire-payments/hire-payment-amend-modal";
import { HirePaymentDiscountModal } from "@/components/fleet/hire-payments/hire-payment-discount-modal";
import { HirePaymentRowHistoryModal } from "@/components/fleet/hire-payments/hire-payment-row-history-modal";
import { HirePaymentRejectModal } from "@/components/fleet/hire-payments/hire-payment-reject-modal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState, useTransition } from "react";

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

export function HirePaymentRowActions({
  row,
  canRecordOnRow,
  canApprove,
  canApplyDiscount,
  readOnly = false,
  onRefresh,
  onError,
}: {
  row: HirePaymentPageRow;
  canRecordOnRow: boolean;
  canApprove: boolean;
  canApplyDiscount: boolean;
  readOnly?: boolean;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [discountOpen, setDiscountOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const canMarkPaid =
    !readOnly &&
    canRecordOnRow &&
    row.balanceGbp > 0 &&
    row.paymentStatus !== "pending_approval" &&
    (row.paymentStatus === "not_received" || row.paymentStatus === "rejected");

  const canDiscount =
    !readOnly &&
    canApplyDiscount &&
    row.balanceGbp > 0 &&
    row.paymentStatus !== "pending_approval" &&
    row.paymentStatus !== "approved";

  const canApproveRow = !readOnly && canApprove && row.paymentStatus === "pending_approval";
  const canAmendRow = !readOnly && canApprove && row.paymentStatus === "approved";

  if (readOnly) {
    return (
      <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={triggerClass} aria-label="Payment row actions" title="Actions">
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
            <DropdownMenu.Item className={itemClass} onSelect={() => setHistoryOpen(true)}>
              History
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
        <HirePaymentRowHistoryModal
          scheduleRowId={row.id}
          periodLabel={row.periodLabel}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      </>
    );
  }

  function recordRow() {
    startTransition(async () => {
      const res = await recordStaffHirePaymentRowAction(row.id);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onRefresh();
    });
  }

  function approveRow() {
    startTransition(async () => {
      const res = await approveHirePaymentRowAction(row.id);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onRefresh();
    });
  }

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={triggerClass}
            disabled={pending}
            aria-label="Payment row actions"
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
            <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={() => setHistoryOpen(true)}>
              History
            </DropdownMenu.Item>
            {canMarkPaid ? (
              <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={recordRow}>
                Mark paid
              </DropdownMenu.Item>
            ) : null}
            {canDiscount ? (
              <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={() => setDiscountOpen(true)}>
                Apply discount
              </DropdownMenu.Item>
            ) : null}
            {canApproveRow ? (
              <>
                <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={approveRow}>
                  Approve
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={() => setRejectOpen(true)}>
                  Reject…
                </DropdownMenu.Item>
              </>
            ) : null}
            {canAmendRow ? (
              <DropdownMenu.Item className={itemClass} disabled={pending} onSelect={() => setAmendOpen(true)}>
                Amend approved…
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <HirePaymentDiscountModal
        row={row}
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        onSuccess={onRefresh}
      />
      <HirePaymentRejectModal
        row={row}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onSuccess={onRefresh}
      />
      <HirePaymentAmendModal
        row={row}
        open={amendOpen}
        onClose={() => setAmendOpen(false)}
        onSuccess={onRefresh}
      />
      <HirePaymentRowHistoryModal
        scheduleRowId={row.id}
        periodLabel={row.periodLabel}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
