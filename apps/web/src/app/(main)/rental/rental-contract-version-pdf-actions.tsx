"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { platformAgreementPdfFileName } from "@/lib/companies/contract-version-display";
import { rentalContractCopy } from "@/lib/rental-contract-copy";

const triggerClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";

const contentClass =
  "z-[200] min-w-[11rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

function contractVersionPdfUrl(versionId: string, download: boolean): string {
  const disposition = download ? "attachment" : "inline";
  return `/api/rental/contract-versions/${encodeURIComponent(versionId)}/pdf?disposition=${disposition}`;
}

function PdfLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-rph-page/90">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
        aria-hidden
      />
      <p className="text-sm font-medium text-rph-fg-secondary">{label}</p>
    </div>
  );
}

function AgreementPreviewModal({
  open,
  versionId,
  versionNumber,
  previewUrl,
  downloadUrl,
  fileName,
  onClose,
}: {
  open: boolean;
  versionId: string;
  versionNumber: number;
  previewUrl: string;
  downloadUrl: string;
  fileName: string;
  onClose: () => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(true);
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPdfLoading(!loadedRef.current.has(versionId));
    }
  }, [open, versionId]);

  if (!open) return null;

  const alreadyLoaded = loadedRef.current.has(versionId);

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`agreement-preview-${versionId}`}
        className="relative z-10 flex max-h-[min(92vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-rph-border bg-rph-raised shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-3">
          <div>
            <h2 id={`agreement-preview-${versionId}`} className="text-base font-semibold text-rph-fg">
              {rentalContractCopy.platformAgreementPreviewTitle}
            </h2>
            <p className="text-sm text-rph-fg-muted">Version {versionNumber}</p>
          </div>
          <button type="button" className="rph-btn-ghost px-2 py-1 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="relative min-h-0 flex-1 p-4">
          {pdfLoading && !alreadyLoaded ? (
            <PdfLoadingOverlay label={rentalContractCopy.platformAgreementPdfLoading} />
          ) : null}
          <iframe
            title={`${rentalContractCopy.platformAgreementPreviewTitle} v${versionNumber}`}
            src={previewUrl}
            onLoad={() => {
              loadedRef.current.add(versionId);
              setPdfLoading(false);
            }}
            className="h-[min(70vh,40rem)] w-full rounded-lg border border-rph-border bg-white"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-rph-border px-4 py-3">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rph-btn-ghost px-3 py-1.5 text-sm"
          >
            {rentalContractCopy.platformAgreementOpenNewTab}
          </a>
          <a href={downloadUrl} download={fileName} className="rph-btn-primary px-3 py-1.5 text-sm">
            {rentalContractCopy.platformAgreementDownload}
          </a>
        </div>
      </div>
    </div>
  );
}

export function RentalContractVersionPdfActions({
  versionId,
  versionNumber,
  hasPdf,
  compact = false,
}: {
  versionId: string;
  versionNumber: number;
  hasPdf: boolean;
  compact?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const fileName = platformAgreementPdfFileName(versionNumber);
  const previewUrl = contractVersionPdfUrl(versionId, false);
  const downloadUrl = contractVersionPdfUrl(versionId, true);

  const openPreview = useCallback(() => {
    if (!hasPdf) return;
    startTransition(() => {
      setPreviewOpen(true);
    });
  }, [hasPdf]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  if (!hasPdf) {
    return (
      <span className="text-xs text-rph-fg-muted">{rentalContractCopy.platformAgreementPdfUnavailable}</span>
    );
  }

  if (!compact) {
    return (
      <>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rph-btn-ghost px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={openPreview}
          >
            {rentalContractCopy.platformAgreementPreview}
          </button>
          <a href={downloadUrl} download={fileName} className="rph-btn-primary px-3 py-1.5 text-sm">
            {rentalContractCopy.platformAgreementDownload}
          </a>
        </div>

        <AgreementPreviewModal
          open={previewOpen}
          versionId={versionId}
          versionNumber={versionNumber}
          previewUrl={previewUrl}
          downloadUrl={downloadUrl}
          fileName={fileName}
          onClose={closePreview}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={triggerClass}
            disabled={pending}
            aria-label="Agreement actions"
            title="Actions"
          >
            <IconKebabVertical />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={contentClass}>
            <DropdownMenu.Item className={itemClass} onSelect={openPreview}>
              {rentalContractCopy.platformAgreementPreview}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} asChild>
              <a href={downloadUrl} download={fileName}>
                {rentalContractCopy.platformAgreementDownload}
              </a>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <AgreementPreviewModal
        open={previewOpen}
        versionId={versionId}
        versionNumber={versionNumber}
        previewUrl={previewUrl}
        downloadUrl={downloadUrl}
        fileName={fileName}
        onClose={closePreview}
      />
    </>
  );
}
