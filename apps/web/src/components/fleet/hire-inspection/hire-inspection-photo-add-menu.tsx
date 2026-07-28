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

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

type HireInspectionPhotoAddMenuProps = {
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
};

/**
 * Add menu for hire inspection vehicle photos.
 *
 * - Choose photos: multi-select from the device gallery or files.
 * - Take photo (phones): rear camera — one shot per open.
 * - Scan (phones): system sheet without capture so iOS can offer Scan Documents.
 */
export function HireInspectionPhotoAddMenu({ disabled, onFiles }: HireInspectionPhotoAddMenuProps) {
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
        accept={PHOTO_ACCEPT}
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
      <input
        ref={scanRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={(e) => handleChange(e.target)}
      />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={triggerClass} disabled={disabled} aria-label="Add photos">
            Add photos
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
            avoidCollisions={false}
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
              <span className="font-medium">Choose photos</span>
              <span className="text-xs text-rph-fg-muted">JPEG, PNG, or WebP · multiple allowed</span>
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
                  <span className="font-medium">Scan or pick from library</span>
                  <span className="text-xs text-rph-fg-muted">
                    Use Scan Documents on iPhone/iPad when offered
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
                  <span className="text-xs text-rph-fg-muted">Camera · one photo at a time</span>
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
