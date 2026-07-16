"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import type { AdminDriverListRow } from "@/lib/admin/driver-list-shared";

const triggerClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:data-[state=open]:bg-slate-800";

function IconKebabVertical({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

const contentClass =
  "z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800";

const itemDestructiveClass = `${itemClass} text-amber-900 dark:text-amber-200`;
const itemPositiveClass = `${itemClass} text-emerald-900 dark:text-emerald-200`;

export function DriverRowActionsMenu({
  driver,
  blocked,
  pendingKey,
  onResetPassword,
  onSetBlocked,
}: {
  driver: AdminDriverListRow;
  blocked: boolean;
  pendingKey: string | null;
  onResetPassword: (userId: string) => void;
  onSetBlocked: (userId: string, blocked: boolean) => void;
}) {
  const busy = pendingKey !== null;
  const uid = driver.userId;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={triggerClass}
          disabled={busy}
          aria-label="Row actions"
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
          alignOffset={0}
          collisionPadding={12}
          className={contentClass}
        >
          <DropdownMenu.Item asChild>
            <Link
              href={`/super-admin/drivers/${uid}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              className={itemClass}
            >
              View preview
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={itemClass}
            disabled={busy || !driver.email}
            title={!driver.email ? "No email on file" : undefined}
            onSelect={() => onResetPassword(uid)}
          >
            {pendingKey === `${uid}-reset` ? "Generating…" : "Reset password"}
          </DropdownMenu.Item>

          {blocked ? (
            <DropdownMenu.Item
              className={itemPositiveClass}
              disabled={busy}
              onSelect={() => onSetBlocked(uid, false)}
            >
              {pendingKey === `${uid}-active` ? "…" : "Set active"}
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className={itemDestructiveClass}
              disabled={busy}
              onSelect={() => onSetBlocked(uid, true)}
            >
              {pendingKey === `${uid}-block` ? "…" : "Block account"}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
