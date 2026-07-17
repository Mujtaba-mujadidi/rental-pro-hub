"use client";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { registerSubcompanyAction } from "@/app/actions/rental-subcompanies";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";

const STEP_LABELS = ["Company", "Registered office", "Primary contact", "Review"] as const;

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

function StepProgress({ step }: { step: number }) {
  const displayStep = step + 1;
  return (
    <nav className="mb-2" aria-label="Register subcompany steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step {displayStep} of {STEP_LABELS.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = n < displayStep;
          const active = n === displayStep;
          const segmentBeforeOrange = i > 0 && displayStep > i;
          return (
            <Fragment key={label}>
              {i > 0 ? (
                <li className="mx-1 h-1 min-w-[8px] flex-1 list-none sm:mx-2" aria-hidden>
                  <div
                    className={[
                      "h-full w-full rounded-full transition-colors duration-300",
                      segmentBeforeOrange ? "bg-orange-500" : "bg-zinc-200 dark:bg-zinc-700",
                    ].join(" ")}
                  />
                </li>
              ) : null}
              <li className="flex list-none flex-col items-center">
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                    done && "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25",
                    active &&
                      "border-orange-500 bg-white text-orange-600 shadow-md ring-4 ring-orange-100 dark:bg-zinc-950 dark:text-orange-500 dark:ring-orange-950/40",
                    !done &&
                      !active &&
                      "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-500",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`${n}. ${label}`}
                >
                  {done ? "✓" : n}
                </div>
                <span
                  className={[
                    "mt-2 hidden max-w-[5.5rem] text-center text-[11px] font-semibold leading-tight sm:block",
                    active ? "text-orange-700 dark:text-orange-400" : done ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
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
      headerExtra={<StepProgress step={step} />}
      pending={pending}
      saveNotice={saveNotice}
      hasStoredDraft={hasStoredDraft}
      isDirty={isDirty}
      onSaveProgress={saveProgress}
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
          <button type="button" className={btnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={btnContinue}
                disabled={pending || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={btnContinue} disabled={pending} onClick={submit}>
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
            <select value={draft.status} onChange={(e) => patch("status", e.target.value)} className={inputClass()}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
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
