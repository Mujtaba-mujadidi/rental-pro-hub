"use client";

import { useRef, useState } from "react";
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
 * - Choose from library: multi-select gallery / files.
 * - Take photos (phones): rear camera, reopening after each shot until Done.
 */
export function HireInspectionPhotoAddMenu({ disabled, onFiles }: HireInspectionPhotoAddMenuProps) {
  const canCapture = useCanScanOrCaptureDocument();
  const filesRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [cameraBurstActive, setCameraBurstActive] = useState(false);

  function handleLibraryChange(input: HTMLInputElement | null) {
    if (!input) return;
    onFiles(input.files);
    input.value = "";
  }

  function handleCameraChange(input: HTMLInputElement | null) {
    if (!input) return;
    const hadFiles = Boolean(input.files?.length);
    onFiles(input.files);
    input.value = "";
    if (cameraBurstActive && hadFiles) {
      window.setTimeout(() => photoRef.current?.click(), 150);
    }
  }

  function startCameraBurst() {
    setCameraBurstActive(true);
    photoRef.current?.click();
  }

  function stopCameraBurst() {
    setCameraBurstActive(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={filesRef}
        type="file"
        className="hidden"
        accept={PHOTO_ACCEPT}
        multiple
        disabled={disabled}
        onChange={(e) => handleLibraryChange(e.target)}
      />
      <input
        ref={photoRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => handleCameraChange(e.target)}
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
            align="end"
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
              <span className="font-medium">Choose from library</span>
              <span className="text-xs text-rph-fg-muted">JPEG, PNG, or WebP · multiple allowed</span>
            </DropdownMenu.Item>

            {canCapture ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-rph-border" />
                <DropdownMenu.Item
                  className={itemClass}
                  disabled={disabled}
                  onSelect={(e) => {
                    e.preventDefault();
                    startCameraBurst();
                  }}
                >
                  <span className="font-medium">Take photos</span>
                  <span className="text-xs text-rph-fg-muted">Camera · take multiple back to back</span>
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {cameraBurstActive ? (
        <button
          type="button"
          className="rph-btn-ghost px-2 py-1 text-xs"
          onClick={stopCameraBurst}
          disabled={disabled}
        >
          Done taking photos
        </button>
      ) : null}
    </div>
  );
}
