"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { registerSubcompanyAction } from "@/app/actions/rental-subcompanies";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";

const STEP_LABELS = ["Company", "Registered office", "Primary contact", "Review"] as const;

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

const initialDraft = {
  name: "",
  legal_name: "",
  company_number: "",
  registered_address_line1: "",
  registered_address_line2: "",
  registered_town: "",
  registered_county: "",
  registered_postcode: "",
  primary_contact_first_name: "",
  primary_contact_last_name: "",
  primary_contact_dob: "",
  primary_contact_phone: "",
  primary_contact_email: "",
  status: "active",
  notes: "",
  country: "GB",
};

type SubcompanySnapshot = { step: number; draft: typeof initialDraft };

const SUBCOMPANY_DRAFT_KEY = "register-subcompany";
const subcompanyBaseline: SubcompanySnapshot = { step: 0, draft: initialDraft };

export function RegisterSubcompanyModal({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const snapshot = useMemo<SubcompanySnapshot>(() => ({ step, draft }), [step, draft]);

  const applySnapshot = useCallback((s: SubcompanySnapshot) => {
    setStep(s.step);
    setDraft({ ...s.draft });
    setError(null);
  }, []);

  const {
    saveNotice,
    hasStoredDraft,
    isDirty,
    saveProgress,
    saveProgressAndClose,
    requestClose,
    requestStartFresh,
    discardConfirmOpen,
    confirmDiscardClose,
    cancelDiscardClose,
    startFreshConfirmOpen,
    confirmStartFresh,
    cancelStartFresh,
    clearAfterSuccess,
  } = useFormModalDraft({
    draftKey: SUBCOMPANY_DRAFT_KEY,
    open,
    snapshot,
    baseline: subcompanyBaseline,
    pending,
    applySnapshot,
    onClose: () => onOpenChange(false),
  });

  const patch = useCallback(<K extends keyof typeof initialDraft>(field: K, value: (typeof initialDraft)[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  }, []);

  const canGoNext = useCallback(() => {
    if (step === 0) return draft.name.trim().length > 0;
    if (step === 2) {
      return (
        draft.primary_contact_first_name.trim().length > 0 &&
        draft.primary_contact_last_name.trim().length > 0 &&
        draft.primary_contact_email.trim().length > 0 &&
        draft.primary_contact_phone.trim().length > 0 &&
        draft.primary_contact_dob.trim().length > 0
      );
    }
    return true;
  }, [step, draft]);

  const submit = useCallback(() => {
    const fd = new FormData();
    fd.set("name", draft.name.trim());
    fd.set("legal_name", draft.legal_name.trim());
    fd.set("company_number", draft.company_number.trim());
    fd.set("registered_address_line1", draft.registered_address_line1.trim());
    fd.set("registered_address_line2", draft.registered_address_line2.trim());
    fd.set("registered_town", draft.registered_town.trim());
    fd.set("registered_county", draft.registered_county.trim());
    fd.set("registered_postcode", draft.registered_postcode.trim());
    fd.set("country", draft.country.trim() || "GB");
    fd.set("primary_contact_first_name", draft.primary_contact_first_name.trim());
    fd.set("primary_contact_last_name", draft.primary_contact_last_name.trim());
    fd.set("primary_contact_dob", draft.primary_contact_dob.trim());
    fd.set("primary_contact_phone", draft.primary_contact_phone.trim());
    fd.set("primary_contact_email", draft.primary_contact_email.trim());
    fd.set("status", draft.status);
    fd.set("notes", draft.notes.trim());

    startTransition(() => {
      void (async () => {
        const res = await registerSubcompanyAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        clearAfterSuccess();
        onRegistered?.();
        onOpenChange(false);
      })();
    });
  }, [draft, onOpenChange, onRegistered, clearAfterSuccess]);

  return (
    <FormModalShell
      open={open}
      titleId="register-subcompany-title"
      title="Register subcompany"
      description="Add a subcompany record under your rental company. This does not create a login account."
      headerExtra={
        <FormModalStepProgress step={step} labels={STEP_LABELS} ariaLabel="Register subcompany steps" />
      }
      pending={pending}
      saveNotice={saveNotice}
      hasStoredDraft={hasStoredDraft}
      isDirty={isDirty}
      onSaveProgress={saveProgress}
      onSaveAndClose={saveProgressAndClose}
      onRequestClose={requestClose}
      onRequestStartFresh={requestStartFresh}
      discardConfirmOpen={discardConfirmOpen}
      onConfirmDiscard={confirmDiscardClose}
      onCancelDiscard={cancelDiscardClose}
      startFreshConfirmOpen={startFreshConfirmOpen}
      onConfirmStartFresh={confirmStartFresh}
      onCancelStartFresh={cancelStartFresh}
      footer={
        <>
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <div className="rph-modal-footer-end">
            {step > 0 ? (
              <button
                type="button"
                className={formModalBtnGhost}
                disabled={pending}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={formModalBtnContinue}
                disabled={pending || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={formModalBtnContinue} disabled={pending} onClick={submit}>
                {pending ? "Saving…" : "Save subcompany"}
              </button>
            )}
          </div>
        </>
      }
    >
      {error ? <p className="mb-4 rph-alert-error">{error}</p> : null}

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Company name *</label>
            <input value={draft.name} onChange={(e) => patch("name", e.target.value)} className={inputClass()} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Legal name</label>
            <input value={draft.legal_name} onChange={(e) => patch("legal_name", e.target.value)} className={inputClass()} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Company number</label>
            <input value={draft.company_number} onChange={(e) => patch("company_number", e.target.value)} className={inputClass()} />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Address line 1</label>
            <input
              value={draft.registered_address_line1}
              onChange={(e) => patch("registered_address_line1", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Address line 2</label>
            <input
              value={draft.registered_address_line2}
              onChange={(e) => patch("registered_address_line2", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Town / city</label>
            <input value={draft.registered_town} onChange={(e) => patch("registered_town", e.target.value)} className={inputClass()} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">County</label>
            <input value={draft.registered_county} onChange={(e) => patch("registered_county", e.target.value)} className={inputClass()} />
          </div>
          <div className="space-y-1 sm:max-w-xs">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Postcode</label>
            <input
              value={draft.registered_postcode}
              onChange={(e) => patch("registered_postcode", e.target.value)}
              className={inputClass()}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">First name *</label>
            <input
              value={draft.primary_contact_first_name}
              onChange={(e) => patch("primary_contact_first_name", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Last name *</label>
            <input
              value={draft.primary_contact_last_name}
              onChange={(e) => patch("primary_contact_last_name", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date of birth *</label>
            <input
              type="date"
              value={draft.primary_contact_dob}
              onChange={(e) => patch("primary_contact_dob", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone number *</label>
            <input
              type="tel"
              value={draft.primary_contact_phone}
              onChange={(e) => patch("primary_contact_phone", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email *</label>
            <input
              type="email"
              value={draft.primary_contact_email}
              onChange={(e) => patch("primary_contact_email", e.target.value)}
              className={inputClass()}
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="space-y-1 sm:max-w-xs">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</label>
            <FormModalSelect
              value={draft.status}
              aria-label="Status"
              options={[
                { value: "active", label: "Active" },
                { value: "pending", label: "Pending" },
                { value: "inactive", label: "Inactive" },
              ]}
              onValueChange={(v) => patch("status", v)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Internal notes</label>
            <textarea value={draft.notes} onChange={(e) => patch("notes", e.target.value)} rows={2} className={inputClass()} />
          </div>
        </div>
      ) : null}
    </FormModalShell>
  );
}
