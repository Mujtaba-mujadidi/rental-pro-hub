"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

const triggerClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-medium text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[11.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

async function downloadFile(url: string, fileName: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download file.");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function HireDetailsDocActionsMenu({
  viewUrl,
  fileName,
  onError,
}: {
  viewUrl: string | null;
  fileName: string;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState<"view" | "download" | null>(null);
  const busy = pending != null;

  if (!viewUrl) return null;

  async function viewDoc() {
    setPending("view");
    try {
      window.open(viewUrl!, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not open document.");
    } finally {
      setPending(null);
    }
  }

  async function downloadDoc() {
    setPending("download");
    try {
      await downloadFile(viewUrl!, fileName);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not download document.");
      window.open(viewUrl!, "_blank", "noopener,noreferrer");
    } finally {
      setPending(null);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClass} disabled={busy} aria-label="Document actions">
          {busy ? (pending === "view" ? "Opening…" : "Preparing…") : "Actions"}
          <span className="text-[10px] text-rph-fg-muted" aria-hidden>
            ▾
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={6}
          avoidCollisions={false}
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function hireDetailsDocumentFileName(label: string, fileName?: string | null): string {
  if (fileName?.trim()) return fileName.trim();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "document"}.pdf`;
}
