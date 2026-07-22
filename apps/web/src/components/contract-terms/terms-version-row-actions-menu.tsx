"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { TermsVersionRow } from "@/lib/contract-terms/types";

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
  row: TermsVersionRow;
  canManage: boolean;
  disabled?: boolean;
  onView: () => void;
  onEdit: () => void;
  onNewVersion: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onRestoreActive: () => void;
};

export function TermsVersionRowActionsMenu({
  row,
  canManage,
  disabled = false,
  onView,
  onEdit,
  onNewVersion,
  onPublish,
  onArchive,
  onRestoreActive,
}: Props) {
  const showEdit = row.status === "draft" && canManage;
  const showNewVersion = (row.status === "published" || row.status === "archived") && canManage;
  const showPublish = row.status === "draft" && canManage;
  const showArchive = row.status === "published" && canManage;
  const showRestore = row.status === "archived" && canManage;
  const hasDestructive = showArchive;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClass} disabled={disabled} aria-label="Version actions" title="Actions">
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={contentClass}>
          <DropdownMenu.Item className={itemClass} onSelect={onView}>
            Preview
          </DropdownMenu.Item>

          {showEdit ? (
            <DropdownMenu.Item className={itemClass} onSelect={onEdit}>
              Edit draft
            </DropdownMenu.Item>
          ) : null}

          {showNewVersion ? (
            <DropdownMenu.Item className={itemClass} onSelect={onNewVersion}>
              New version
            </DropdownMenu.Item>
          ) : null}

          {showPublish ? (
            <DropdownMenu.Item className={itemClass} onSelect={onPublish}>
              Publish
            </DropdownMenu.Item>
          ) : null}

          {showRestore ? (
            <DropdownMenu.Item className={itemClass} onSelect={onRestoreActive}>
              Restore active
            </DropdownMenu.Item>
          ) : null}

          {hasDestructive ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-rph-border" />
              <DropdownMenu.Item className={itemDangerClass} onSelect={onArchive}>
                Archive
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
