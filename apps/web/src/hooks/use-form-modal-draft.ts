"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft, stableSerialize } from "@/lib/forms/form-draft";

export type UseFormModalDraftOptions<T> = {
  /** Stable id, e.g. `register-company` or `contract-terms:abc`. */
  draftKey: string;
  open: boolean;
  /** Current form snapshot (fields + step, etc.). */
  snapshot: T;
  /** Empty / default snapshot used when there is no stored draft. */
  baseline: T;
  pending?: boolean;
  /** Apply a restored (or reset) snapshot into component state. */
  applySnapshot: (value: T) => void;
  /** Close the modal (parent `onOpenChange(false)`). */
  onClose: () => void;
  /** Fired after an explicit Save draft. */
  onAfterSave?: (snapshot: T) => void;
  /** Fired after draft cleared (submit success or start fresh). */
  onAfterClear?: () => void;
};

export type UseFormModalDraftResult = {
  isDirty: boolean;
  hasStoredDraft: boolean;
  saveNotice: string | null;
  discardConfirmOpen: boolean;
  startFreshConfirmOpen: boolean;
  saveProgress: () => void;
  /** Persist draft to this device, then close the modal. */
  saveProgressAndClose: () => void;
  requestClose: () => void;
  confirmDiscardClose: () => void;
  cancelDiscardClose: () => void;
  requestStartFresh: () => void;
  confirmStartFresh: () => void;
  cancelStartFresh: () => void;
  /** Call after successful final submit. */
  clearAfterSuccess: () => void;
};

/**
 * localStorage draft + dirty tracking for modal forms.
 * Dirty = current snapshot differs from last explicitly saved snapshot
 * (or from baseline when never saved).
 */
export function useFormModalDraft<T>(options: UseFormModalDraftOptions<T>): UseFormModalDraftResult {
  const {
    draftKey,
    open,
    snapshot,
    baseline,
    pending = false,
    applySnapshot,
    onClose,
    onAfterSave,
    onAfterClear,
  } = options;

  const [lastSavedSerialized, setLastSavedSerialized] = useState(() => stableSerialize(baseline));
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [startFreshConfirmOpen, setStartFreshConfirmOpen] = useState(false);
  const applySnapshotRef = useRef(applySnapshot);
  applySnapshotRef.current = applySnapshot;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const onAfterSaveRef = useRef(onAfterSave);
  onAfterSaveRef.current = onAfterSave;
  const onAfterClearRef = useRef(onAfterClear);
  onAfterClearRef.current = onAfterClear;

  const currentSerialized = stableSerialize(snapshot);
  const isDirty = currentSerialized !== lastSavedSerialized;

  useEffect(() => {
    if (!open) {
      setDiscardConfirmOpen(false);
      setStartFreshConfirmOpen(false);
      setSaveNotice(null);
      return;
    }

    const stored = loadDraft<T>(draftKey);
    if (stored) {
      applySnapshotRef.current(stored.data);
      setLastSavedSerialized(stableSerialize(stored.data));
      setHasStoredDraft(true);
    } else {
      applySnapshotRef.current(baselineRef.current);
      setLastSavedSerialized(stableSerialize(baselineRef.current));
      setHasStoredDraft(false);
    }
  }, [open, draftKey]);

  useEffect(() => {
    if (!saveNotice) return;
    const t = window.setTimeout(() => setSaveNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [saveNotice]);

  const saveProgress = useCallback(() => {
    saveDraft(draftKey, snapshot);
    setLastSavedSerialized(stableSerialize(snapshot));
    setHasStoredDraft(true);
    setSaveNotice("Draft saved on this device only. Nothing is created in the system until you finish and submit.");
    onAfterSaveRef.current?.(snapshot);
  }, [draftKey, snapshot]);

  const saveProgressAndClose = useCallback(() => {
    if (pending) return;
    saveDraft(draftKey, snapshot);
    setLastSavedSerialized(stableSerialize(snapshot));
    setHasStoredDraft(true);
    onAfterSaveRef.current?.(snapshot);
    onClose();
  }, [pending, draftKey, snapshot, onClose]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setDiscardConfirmOpen(true);
  }, [pending]);

  const confirmDiscardClose = useCallback(() => {
    setDiscardConfirmOpen(false);
    onClose();
  }, [onClose]);

  const cancelDiscardClose = useCallback(() => {
    setDiscardConfirmOpen(false);
  }, []);

  const requestStartFresh = useCallback(() => {
    if (pending) return;
    setStartFreshConfirmOpen(true);
  }, [pending]);

  const confirmStartFresh = useCallback(() => {
    clearDraft(draftKey);
    applySnapshotRef.current(baselineRef.current);
    setLastSavedSerialized(stableSerialize(baselineRef.current));
    setHasStoredDraft(false);
    setStartFreshConfirmOpen(false);
    setSaveNotice(null);
    onAfterClearRef.current?.();
  }, [draftKey]);

  const cancelStartFresh = useCallback(() => {
    setStartFreshConfirmOpen(false);
  }, []);

  const clearAfterSuccess = useCallback(() => {
    clearDraft(draftKey);
    setHasStoredDraft(false);
    setLastSavedSerialized(stableSerialize(baselineRef.current));
    onAfterClearRef.current?.();
  }, [draftKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || pending) return;
      if (discardConfirmOpen || startFreshConfirmOpen) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, discardConfirmOpen, startFreshConfirmOpen, requestClose]);

  return {
    isDirty,
    hasStoredDraft,
    saveNotice,
    discardConfirmOpen,
    startFreshConfirmOpen,
    saveProgress,
    saveProgressAndClose,
    requestClose,
    confirmDiscardClose,
    cancelDiscardClose,
    requestStartFresh,
    confirmStartFresh,
    cancelStartFresh,
    clearAfterSuccess,
  };
}
