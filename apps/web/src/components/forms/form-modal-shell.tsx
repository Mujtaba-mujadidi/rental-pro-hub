"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnSave =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-rph-rail/30 bg-rph-rail/10 px-3 text-sm font-semibold text-rph-rail hover:bg-rph-rail/15 disabled:opacity-50 dark:border-rph-rail-soft/40 dark:bg-rph-rail-soft/15 dark:text-rph-rail-soft dark:hover:bg-rph-rail-soft/25";
const iconGhostBtn =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rph-rail/35 focus-visible:ring-offset-2 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900";

function IconExpand({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function IconCollapse({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
    </svg>
  );
}

export type FormModalShellProps = {
  open: boolean;
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content under the title row (e.g. step progress). */
  headerExtra?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  pending?: boolean;
  zClass?: string;
  panelClassName?: string;
  maxWidthClass?: string;
  /** Fixed or max height for the panel body (non-maximized). Default: max-h-[min(90vh,52rem)] */
  panelHeightClass?: string;
  saveNotice?: string | null;
  hasStoredDraft?: boolean;
  isDirty?: boolean;
  /** When false, hides Save draft / Save and close (e.g. edit forms without local drafts). Default true. */
  showDraftActions?: boolean;
  onSaveProgress?: () => void;
  /** Save draft to this device and close immediately. */
  onSaveAndClose?: () => void;
  onRequestClose: () => void;
  onRequestStartFresh?: () => void;
  discardConfirmOpen: boolean;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
  startFreshConfirmOpen?: boolean;
  onConfirmStartFresh?: () => void;
  onCancelStartFresh?: () => void;
  /** Show expand / restore control for large forms (e.g. terms editor). */
  allowMaximize?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
};

/**
 * Shared form modal chrome: backdrop never dismisses; Save and close + Close in header;
 * discard / start-fresh confirms.
 */
export function FormModalShell({
  open,
  titleId,
  title,
  description,
  headerExtra,
  children,
  footer,
  pending = false,
  zClass = "z-[310]",
  panelClassName,
  maxWidthClass = "max-w-3xl",
  panelHeightClass = "max-h-[min(90vh,52rem)]",
  saveNotice,
  hasStoredDraft = false,
  isDirty = false,
  showDraftActions = true,
  onSaveProgress,
  onSaveAndClose,
  onRequestClose,
  onRequestStartFresh,
  discardConfirmOpen,
  onConfirmDiscard,
  onCancelDiscard,
  startFreshConfirmOpen = false,
  onConfirmStartFresh,
  onCancelStartFresh,
  allowMaximize = false,
  onMaximizedChange,
}: FormModalShellProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!open) {
      setMaximized(false);
      onMaximizedChange?.(false);
    }
  }, [open, onMaximizedChange]);

  function toggleMaximize() {
    setMaximized((m) => {
      const next = !m;
      onMaximizedChange?.(next);
      return next;
    });
  }

  if (!open) return null;

  const panelClasses =
    panelClassName ??
    (maximized
      ? "relative z-[1] flex h-[100dvh] min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-white shadow-none dark:bg-zinc-950"
      : `relative z-[1] flex ${panelHeightClass} w-full ${maxWidthClass} flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950`);

  const outerClass = maximized
    ? `fixed inset-0 ${zClass} flex items-stretch justify-stretch p-0`
    : `fixed inset-0 ${zClass} flex items-center justify-center p-4 sm:p-6`;

  return (
    <>
      <div className={outerClass}>
        {/* Decorative backdrop — does not close the modal */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={panelClasses}
        >
          <div className="shrink-0 border-b border-zinc-200/90 px-6 pb-4 pt-6 dark:border-zinc-700 sm:px-10 sm:pt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showDraftActions && hasStoredDraft && onRequestStartFresh ? (
                  <button type="button" className={btnGhost} disabled={pending} onClick={onRequestStartFresh}>
                    Start fresh
                  </button>
                ) : null}
                {showDraftActions && onSaveProgress ? (
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={pending || !isDirty}
                    onClick={onSaveProgress}
                    title="Stores a draft in this browser and keeps the form open. Does not create a record yet."
                  >
                    Save draft
                  </button>
                ) : null}
                {showDraftActions && onSaveAndClose ? (
                  <button
                    type="button"
                    className={btnSave}
                    disabled={pending}
                    onClick={onSaveAndClose}
                    title="Stores a draft in this browser, then closes. Does not create a record yet."
                  >
                    Save and close
                  </button>
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  {allowMaximize ? (
                    <button
                      type="button"
                      className={iconGhostBtn}
                      disabled={pending}
                      aria-pressed={maximized}
                      onClick={toggleMaximize}
                      title={maximized ? "Exit full screen" : "Full screen"}
                    >
                      {maximized ? <IconCollapse /> : <IconExpand />}
                      <span className="sr-only">{maximized ? "Exit full screen" : "Full screen"}</span>
                    </button>
                  ) : null}
                  <button type="button" className={btnGhost} disabled={pending} onClick={onRequestClose}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            {saveNotice ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
                {saveNotice}
              </p>
            ) : showDraftActions && hasStoredDraft ? (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Restored from a draft on this device. Finish all steps and submit to create the record — drafts do not
                appear in the list.
              </p>
            ) : null}
            {headerExtra}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">{children}</div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700 sm:px-10">
            {footer}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={discardConfirmOpen}
        title={isDirty ? "Close without saving?" : "Close this form?"}
        description={
          isDirty
            ? "You have changes that are not in your draft. Closing keeps your last Save draft (if any) on this device for later, but edits since then will be lost. Drafts are not listed in tables until you fully submit."
            : "Your last saved draft (if any) will stay on this device. Nothing is created in the system until you finish and submit."
        }
        confirmLabel={isDirty ? "Discard and close" : "Close"}
        cancelLabel="Keep editing"
        variant="danger"
        pending={pending}
        onConfirm={onConfirmDiscard}
        onCancel={onCancelDiscard}
      />

      {onConfirmStartFresh && onCancelStartFresh ? (
        <ConfirmDialog
          open={startFreshConfirmOpen}
          title="Start fresh?"
          description="This clears saved progress for this form on this device and resets all fields."
          confirmLabel="Clear and start fresh"
          cancelLabel="Cancel"
          variant="danger"
          pending={pending}
          onConfirm={onConfirmStartFresh}
          onCancel={onCancelStartFresh}
        />
      ) : null}
    </>
  );
}
