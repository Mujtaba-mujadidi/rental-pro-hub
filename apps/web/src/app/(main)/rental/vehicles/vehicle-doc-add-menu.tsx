"use client";

import { useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";

const triggerClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rph-border bg-rph-raised px-3 text-sm font-medium text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[14rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none flex-col items-start gap-0.5 px-3 py-2 text-left text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

/**
 * Add menu for vehicle documents.
 *
 * - Choose files: multi-select PDF/images from the device.
 * - Take photo (phones): rear camera — one shot per open; choose again to add more pages.
 * - Scan documents (phones): opens the system file sheet without forcing the camera so
 *   iOS can offer “Scan Documents” (edge crop / multi-page). Browsers cannot open that
 *   scanner API directly.
 */
export function VehicleDocAddMenu({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const canScanOrCapture = useCanScanOrCaptureDocument();
  const filesRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  function handleChange(input: HTMLInputElement | null) {
    if (!input) return;
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
        disabled={disabled}
        onChange={(e) => handleChange(e.target)}
      />
      <input
        ref={photoRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => handleChange(e.target)}
      />
      {/* No capture — lets iOS show Scan Documents / Files instead of only the camera. */}
      <input
        ref={scanRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        multiple
        disabled={disabled}
        onChange={(e) => handleChange(e.target)}
      />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={triggerClass} disabled={disabled} aria-label="Add document">
            Add
            <span className="text-xs text-rph-fg-muted" aria-hidden>
              ▾
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className={contentClass}
          >
            <DropdownMenu.Item
              className={itemClass}
              disabled={disabled}
              onSelect={(e) => {
                e.preventDefault();
                filesRef.current?.click();
              }}
            >
              <span className="font-medium">Choose files</span>
              <span className="text-xs text-rph-fg-muted">PDF or images · multiple allowed</span>
            </DropdownMenu.Item>

            {canScanOrCapture ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-rph-border" />
                <DropdownMenu.Item
                  className={itemClass}
                  disabled={disabled}
                  onSelect={(e) => {
                    e.preventDefault();
                    scanRef.current?.click();
                  }}
                >
                  <span className="font-medium">Scan documents</span>
                  <span className="text-xs text-rph-fg-muted">
                    Use Scan Documents on iPhone/iPad when offered · multi-page
                  </span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={itemClass}
                  disabled={disabled}
                  onSelect={(e) => {
                    e.preventDefault();
                    photoRef.current?.click();
                  }}
                >
                  <span className="font-medium">Take photo</span>
                  <span className="text-xs text-rph-fg-muted">One page at a time · add again for more</span>
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
