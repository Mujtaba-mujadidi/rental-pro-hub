"use client";

import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getVehicleDocumentUrlAction } from "@/app/actions/rental-vehicles";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";
import type { VehicleDocumentRow } from "@/lib/fleet/vehicles";

const triggerClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-medium text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[11.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

const dangerItemClass = `${itemClass} text-red-700 dark:text-red-300`;

async function resolveDocUrl(docId: string) {
  const res = await getVehicleDocumentUrlAction(docId);
  if (!res.ok) throw new Error(res.error);
  return res;
}

/**
 * One compact Actions menu for a document row: view / download / upload / remove.
 */
export function VehicleDocRowMenu({
  doc,
  canManage,
  removeDisabled,
  onRemove,
  onFiles,
  onError,
}: {
  doc?: VehicleDocumentRow | null;
  canManage?: boolean;
  removeDisabled?: boolean;
  onRemove?: () => void;
  onFiles?: (files: FileList | null) => void;
  onError?: (message: string) => void;
}) {
  const canScanOrCapture = useCanScanOrCaptureDocument();
  const [pending, setPending] = useState<"view" | "download" | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const busy = pending != null;
  const onFile = Boolean(doc);

  async function viewDoc() {
    if (!doc) return;
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
    if (!doc) return;
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

  function handleFileInput(input: HTMLInputElement | null) {
    if (!input || !onFiles) return;
    onFiles(input.files);
    input.value = "";
  }

  return (
    <>
      <input
        ref={filesRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFileInput(e.target)}
      />
      <input
        ref={photoRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileInput(e.target)}
      />
      <input
        ref={scanRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => handleFileInput(e.target)}
      />

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
            {onFile ? (
              <>
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
              </>
            ) : null}

            {canManage && onFiles ? (
              <>
                {onFile ? <DropdownMenu.Separator className="my-1 h-px bg-rph-border" /> : null}
                <DropdownMenu.Item
                  className={itemClass}
                  onSelect={(e) => {
                    e.preventDefault();
                    filesRef.current?.click();
                  }}
                >
                  {onFile ? "Replace with files" : "Choose files"}
                </DropdownMenu.Item>
                {canScanOrCapture ? (
                  <>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={(e) => {
                        e.preventDefault();
                        scanRef.current?.click();
                      }}
                    >
                      Scan documents
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={(e) => {
                        e.preventDefault();
                        photoRef.current?.click();
                      }}
                    >
                      Take photo
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </>
            ) : null}

            {canManage && onFile && onRemove ? (
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
    </>
  );
}
