"use client";

import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnSave =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-rph-rail/30 bg-rph-rail/10 px-3 text-sm font-semibold text-rph-rail hover:bg-rph-rail/15 disabled:opacity-50 dark:border-rph-rail-soft/40 dark:bg-rph-rail-soft/15 dark:text-rph-rail-soft dark:hover:bg-rph-rail-soft/25";

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
}: FormModalShellProps) {
  if (!open) return null;

  return (
    <>
      <div className={`fixed inset-0 ${zClass} flex items-center justify-center p-4 sm:p-6`}>
        {/* Decorative backdrop — does not close the modal */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={
            panelClassName ??
            `relative z-[1] flex max-h-[min(90vh,52rem)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950`
          }
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
                <button type="button" className={btnGhost} disabled={pending} onClick={onRequestClose}>
                  Close
                </button>
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
