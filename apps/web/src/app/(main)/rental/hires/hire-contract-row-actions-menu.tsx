"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";

const triggerClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[11rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const menuItemBase =
  "flex cursor-default select-none items-center px-3 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

const itemClass = `${menuItemBase} text-rph-fg`;

const itemDangerClass = `${menuItemBase} text-red-600 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:text-red-300`;

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

type Props = {
  row: HireContractTableRow;
  canWrite: boolean;
  disabled?: boolean;
  onAudit: () => void;
  onContinue: () => void;
  onPrepareForSignature: () => void;
  onSendForSignature: () => void;
  onRegenerateContracts: () => void;
  onCancel: () => void;
};

export function HireContractRowActionsMenu({
  row,
  canWrite,
  disabled = false,
  onAudit,
  onContinue,
  onPrepareForSignature,
  onSendForSignature,
  onRegenerateContracts,
  onCancel,
}: Props) {
  const showContinue = row.status === "draft" && canWrite;
  const showPrepareForSignature = row.can_prepare_for_signature && canWrite;
  const showSendForSignature = row.can_send_for_signature && canWrite;
  const showRegenerateContracts = row.can_regenerate_contracts && canWrite;
  const showCancel = row.can_cancel && canWrite;
  const showViewSignedDocuments = row.can_view_signed_documents;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClass} disabled={disabled} aria-label="Contract actions" title="Actions">
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={contentClass}>
          {row.status !== "draft" ? (
            <DropdownMenu.Item className={itemClass} asChild>
              <Link href={`/rental/hires/${row.id}`}>Open hire workspace</Link>
            </DropdownMenu.Item>
          ) : null}

          <DropdownMenu.Item className={itemClass} onSelect={onAudit}>
            Audit trail
          </DropdownMenu.Item>

          {showContinue ? (
            <DropdownMenu.Item className={itemClass} onSelect={onContinue}>
              Continue draft
            </DropdownMenu.Item>
          ) : null}

          {showPrepareForSignature ? (
            <DropdownMenu.Item className={itemClass} onSelect={onPrepareForSignature}>
              Prepare documents for signature
              {row.agreement_count > 1 ? ` (${row.agreement_count} agreements)` : ""}
            </DropdownMenu.Item>
          ) : null}

          {showSendForSignature ? (
            <DropdownMenu.Item className={itemClass} onSelect={onSendForSignature}>
              {row.signing_bundle_sent_at ? "Resend for signature" : "Send for signature"}
              {row.agreement_count > 1 ? ` (${row.agreement_count} agreements)` : ""}
            </DropdownMenu.Item>
          ) : null}

          {showViewSignedDocuments ? (
            <DropdownMenu.Item className={itemClass} asChild>
              <Link href={`/rental/hires/${row.id}/documents`}>
                View signed document{row.signed_agreement_count === 1 ? "" : "s"}
                {row.agreement_count > 1 ? ` (${row.signed_agreement_count}/${row.agreement_count})` : ""}
              </Link>
            </DropdownMenu.Item>
          ) : null}

          {showRegenerateContracts ? (
            <DropdownMenu.Item className={itemClass} onSelect={onRegenerateContracts}>
              Discard layout &amp; regenerate contracts
            </DropdownMenu.Item>
          ) : null}

          {showCancel ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-rph-border" />
              <DropdownMenu.Item className={itemDangerClass} onSelect={onCancel}>
                Cancel contract
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
