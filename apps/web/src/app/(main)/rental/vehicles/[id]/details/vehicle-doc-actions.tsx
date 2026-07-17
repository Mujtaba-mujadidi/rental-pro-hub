"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getVehicleDocumentUrlAction } from "@/app/actions/rental-vehicles";
import type { VehicleDocumentRow } from "@/lib/fleet/vehicles";

const triggerClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rph-border bg-rph-raised px-3 text-sm font-medium text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[10.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

const dangerItemClass = `${itemClass} text-red-700 dark:text-red-300`;

async function resolveDocUrl(docId: string) {
  const res = await getVehicleDocumentUrlAction(docId);
  if (!res.ok) throw new Error(res.error);
  return res;
}

export function VehicleDocActionsMenu({
  doc,
  canRemove,
  removeDisabled,
  onRemove,
  onError,
}: {
  doc: VehicleDocumentRow;
  canRemove?: boolean;
  removeDisabled?: boolean;
  onRemove?: () => void;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState<"view" | "download" | null>(null);
  const busy = pending != null;

  async function viewDoc() {
    setPending("view");
    try {
      const { url } = await resolveDocUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not open document.");
    } finally {
      setPending(null);
    }
  }

  async function downloadDoc() {
    setPending("download");
    try {
      const { url, fileName } = await resolveDocUrl(doc.id);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not download document.");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not download document.");
    } finally {
      setPending(null);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClass} disabled={busy} aria-label="Document actions" title="Actions">
          {busy ? (pending === "view" ? "Opening…" : "Preparing…") : "Actions"}
          <span className="text-xs text-rph-fg-muted" aria-hidden>
            ▾
          </span>
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
          <DropdownMenu.Item
            className={itemClass}
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              void viewDoc();
            }}
          >
            View
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemClass}
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              void downloadDoc();
            }}
          >
            Download
          </DropdownMenu.Item>
          {canRemove && onRemove ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-rph-border" />
              <DropdownMenu.Item
                className={dangerItemClass}
                disabled={busy || removeDisabled}
                onSelect={(e) => {
                  e.preventDefault();
                  onRemove();
                }}
              >
                Remove
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
