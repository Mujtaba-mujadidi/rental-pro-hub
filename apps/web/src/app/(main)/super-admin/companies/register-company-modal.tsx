"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCompanyAction, getRegisterCompanyInviteDefaultsAction } from "@/app/actions/admin-companies";
import { listPricingPresetsForRegisterAction } from "@/app/actions/contract-presets";
import {
  getPublishedTermsVersionBodyForReviewAction,
  listPublishedTermsForRegisterAction,
} from "@/app/actions/contract-terms";
import { TermsRichViewer } from "@/app/(main)/super-admin/settings/contract-terms/terms-rich-editor";
import { CompanyStepProgress } from "@/components/forms/company-step-progress";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import {
  collectionItemDraftKey,
  loadDraft,
  removeCollectionDraft,
  updateCollectionDraftMeta,
} from "@/lib/forms/form-draft-collection";

const STEP_LABELS = ["Company details", "Registered office", "Primary contact", "Commercial terms", "Review"] as const;

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function inputClass(invalid?: boolean) {
  return [
    "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
    invalid
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
      : "border-zinc-300 focus:border-rph-rail focus:ring-rph-rail/20",
  ].join(" ");
}

/** Native `<select>`: strip OS chevron and show a centered icon (matches text inputs). */
function selectClass(invalid?: boolean) {
  return [
    "w-full appearance-none rounded-lg border bg-white py-2.5 pl-3 pr-10 text-sm text-zinc-900 outline-none focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
    invalid
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
      : "border-zinc-300 focus:border-rph-rail focus:ring-rph-rail/20",
  ].join(" ");
}

function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Matches `contract_pricing_presets.pricing_model_type` check constraint. */
const PRICING_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "fixed_monthly", label: "Fixed monthly — one recurring amount" },
  { value: "per_vehicle", label: "Per vehicle — scales with fleet size" },
  { value: "tiered_vehicles", label: "Tiered by vehicle count — bands or steps" },
  { value: "base_plus_per_vehicle", label: "Base + per vehicle" },
  { value: "custom", label: "Custom — advanced parameters in preset JSON" },
];

function pricingModelOptionLabel(value: string | undefined | null): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "—";
  return PRICING_MODEL_OPTIONS.find((o) => o.value === v)?.label ?? v.replace(/_/g, " ");
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
  billing_email: "",
  contract_type: "rental_agreement",
  pricing_model: "fixed_monthly",
  billing_frequency: "monthly",
  contract_start_date: "",
  currency: "GBP",
  payment_terms_days: "30",
  billing_anchor_day: "",
  recurring_amount: "",
  signatory_name: "",
  signatory_title: "",
  signatory_email: "",
  pricing_preset_id: "",
  terms_catalog_version_id: "",
  status: "active",
  notes: "",
  country: "GB",
};

type RegisterCompanySnapshot = {
  step: number;
  draft: typeof initialDraft;
  sendInvite: boolean;
  billingEmailSameAsPrimary: boolean;
  signatoryEmailSameAsPrimary: boolean;
};

/** Collection id for multi-draft company registration (localStorage index). */
export const REGISTER_COMPANY_DRAFT_COLLECTION = "register-company";
/** @deprecated Legacy single-draft key — migrated into the collection on load. */
export const REGISTER_COMPANY_DRAFT_KEY = "register-company";

const registerCompanyBaseline: RegisterCompanySnapshot = {
  step: 0,
  draft: initialDraft,
  sendInvite: true,
  billingEmailSameAsPrimary: false,
  signatoryEmailSameAsPrimary: false,
};

export type RegisterCompanyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active draft slot id from the companies page multi-draft list. */
  draftId: string | null;
  /** Called when drafts index should refresh (save / clear / remove empty). */
  onDraftsChange?: () => void;
  /** Called after the company row is saved. Optional notice if invite or e-sign send failed or was skipped. */
  onRegistered?: (notice?: string) => void;
};

export function RegisterCompanyModal({
  open,
  onOpenChange,
  draftId,
  onDraftsChange,
  onRegistered,
}: RegisterCompanyModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [presets, setPresets] = useState<{ id: string; name: string; pricing_model_type: string }[]>([]);
  const [publishedTerms, setPublishedTerms] = useState<{ id: string; version_label: string; title: string }[]>([]);
  const [sendInvite, setSendInvite] = useState(true);
  const [billingEmailSameAsPrimary, setBillingEmailSameAsPrimary] = useState(false);
  const [signatoryEmailSameAsPrimary, setSignatoryEmailSameAsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tcReviewOpen, setTcReviewOpen] = useState(false);
  const [tcReview, setTcReview] = useState<{ version_label: string; title: string; body: string } | null>(null);
  const [tcReviewErr, setTcReviewErr] = useState<string | null>(null);
  const [tcReviewPending, startTcReviewTransition] = useTransition();
  const [createOverlay, setCreateOverlay] = useState<ActionStatusOverlayState | null>(null);
  const creating = createOverlay?.phase === "pending";
  const busy = pending || creating;

  const draftKey = draftId
    ? collectionItemDraftKey(REGISTER_COMPANY_DRAFT_COLLECTION, draftId)
    : "register-company:none";

  const snapshot = useMemo<RegisterCompanySnapshot>(
    () => ({ step, draft, sendInvite, billingEmailSameAsPrimary, signatoryEmailSameAsPrimary }),
    [step, draft, sendInvite, billingEmailSameAsPrimary, signatoryEmailSameAsPrimary],
  );

  const applySnapshot = useCallback((s: RegisterCompanySnapshot) => {
    setStep(s.step);
    setDraft({ ...s.draft });
    setSendInvite(s.sendInvite);
    setBillingEmailSameAsPrimary(Boolean(s.billingEmailSameAsPrimary));
    setSignatoryEmailSameAsPrimary(Boolean(s.signatoryEmailSameAsPrimary));
    setError(null);
  }, []);

  const handleAfterSave = useCallback(
    (s: RegisterCompanySnapshot) => {
      if (!draftId) return;
      const name = s.draft.name.trim();
      updateCollectionDraftMeta(REGISTER_COMPANY_DRAFT_COLLECTION, draftId, {
        label: name || "Untitled draft",
      });
      onDraftsChange?.();
    },
    [draftId, onDraftsChange],
  );

  const handleAfterClear = useCallback(() => {
    if (!draftId) return;
    // Keep the slot but reset label; parent may remove empty drafts on close.
    updateCollectionDraftMeta(REGISTER_COMPANY_DRAFT_COLLECTION, draftId, { label: "Untitled draft" });
    onDraftsChange?.();
  }, [draftId, onDraftsChange]);

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
    draftKey,
    open: open && Boolean(draftId),
    snapshot,
    baseline: registerCompanyBaseline,
    pending: busy,
    applySnapshot,
    onClose: () => {
      if (draftId) {
        const stored = loadDraft(draftKey);
        if (!stored) {
          removeCollectionDraft(REGISTER_COMPANY_DRAFT_COLLECTION, draftId);
          onDraftsChange?.();
        }
      }
      onOpenChange(false);
    },
    onAfterSave: handleAfterSave,
    onAfterClear: handleAfterClear,
  });

  useEffect(() => {
    if (!open || !draftId) return;
    setTcReviewOpen(false);
    setTcReview(null);
    setTcReviewErr(null);
    void Promise.all([
      listPricingPresetsForRegisterAction().then((r) => {
        if (r.ok) setPresets(r.presets);
      }),
      listPublishedTermsForRegisterAction().then((r) => {
        if (r.ok) setPublishedTerms(r.versions);
      }),
      getRegisterCompanyInviteDefaultsAction().then((d) => {
        if (d.ok && !loadDraft(draftKey)) setSendInvite(d.defaultSendInvite);
      }),
    ]);
  }, [open, draftId, draftKey]);

  useEffect(() => {
    if (!open || !tcReviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setTcReviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, tcReviewOpen]);

  const openTermsReview = useCallback(() => {
    const id = draft.terms_catalog_version_id.trim();
    if (!id) return;
    setTcReviewOpen(true);
    setTcReview(null);
    setTcReviewErr(null);
    startTcReviewTransition(() => {
      void (async () => {
        const r = await getPublishedTermsVersionBodyForReviewAction(id);
        if (!r.ok) {
          setTcReviewErr(r.error);
          return;
        }
        setTcReview({ version_label: r.version_label, title: r.title, body: r.body });
      })();
    });
  }, [draft.terms_catalog_version_id]);

  const patch = useCallback(<K extends keyof typeof initialDraft>(field: K, value: (typeof initialDraft)[K]) => {
    setDraft((d) => {
      const next = { ...d, [field]: value };
      if (field === "primary_contact_email") {
        const email = String(value);
        if (billingEmailSameAsPrimary) next.billing_email = email;
        if (signatoryEmailSameAsPrimary) next.signatory_email = email;
      }
      return next;
    });
  }, [billingEmailSameAsPrimary, signatoryEmailSameAsPrimary]);

  const setBillingSameAsPrimary = useCallback((checked: boolean) => {
    setBillingEmailSameAsPrimary(checked);
    if (checked) {
      setDraft((d) => ({ ...d, billing_email: d.primary_contact_email }));
    }
  }, []);

  const setSignatorySameAsPrimary = useCallback((checked: boolean) => {
    setSignatoryEmailSameAsPrimary(checked);
    if (checked) {
      setDraft((d) => ({ ...d, signatory_email: d.primary_contact_email }));
    }
  }, []);

  const canGoNext = useCallback(() => {
    if (step === 0) {
      return draft.name.trim().length > 0;
    }
    if (step === 1) return true;
    if (step === 2) {
      return (
        draft.primary_contact_first_name.trim().length > 0 &&
        draft.primary_contact_last_name.trim().length > 0 &&
        draft.primary_contact_email.trim().length > 0 &&
        draft.primary_contact_phone.trim().length > 0 &&
        draft.primary_contact_dob.trim().length > 0
      );
    }
    if (step === 3) {
      if (publishedTerms.length > 0 && !draft.terms_catalog_version_id.trim()) return false;
      return true;
    }
    return true;
  }, [step, draft, publishedTerms.length]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === 0 && !draft.name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (step === 2 && !canGoNext()) {
      setError("Fill in all primary contact fields.");
      return;
    }
    if (step === 3 && publishedTerms.length > 0 && !draft.terms_catalog_version_id.trim()) {
      setError("Select the terms & conditions version for this contract.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }, [step, draft, canGoNext, publishedTerms.length]);

  const goBack = useCallback(() => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const submit = useCallback(() => {
    setError(null);
    if (!draft.name.trim()) {
      setError("Company name is required.");
      setStep(0);
      return;
    }
    const contactOk =
      draft.primary_contact_first_name.trim().length > 0 &&
      draft.primary_contact_last_name.trim().length > 0 &&
      draft.primary_contact_email.trim().length > 0 &&
      draft.primary_contact_phone.trim().length > 0 &&
      draft.primary_contact_dob.trim().length > 0;
    if (!contactOk) {
      setError("Fill in all primary contact fields.");
      setStep(2);
      return;
    }
    if (publishedTerms.length > 0 && !draft.terms_catalog_version_id.trim()) {
      setError("Select the terms & conditions version for this contract.");
      setStep(3);
      return;
    }

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
    fd.set("billing_email", (billingEmailSameAsPrimary ? draft.primary_contact_email : draft.billing_email).trim());
    fd.set("contract_type", draft.contract_type.trim());
    fd.set("pricing_model", draft.pricing_model.trim());
    fd.set("billing_frequency", draft.billing_frequency.trim());
    fd.set("contract_start_date", draft.contract_start_date.trim());
    fd.set("currency", draft.currency.trim());
    fd.set("payment_terms_days", draft.payment_terms_days.trim());
    fd.set("billing_anchor_day", draft.billing_anchor_day.trim());
    fd.set("recurring_amount", draft.recurring_amount.trim());
    fd.set("signatory_name", draft.signatory_name.trim());
    fd.set("signatory_title", draft.signatory_title.trim());
    fd.set(
      "signatory_email",
      (signatoryEmailSameAsPrimary ? draft.primary_contact_email : draft.signatory_email).trim(),
    );
    fd.set("pricing_preset_id", draft.pricing_preset_id.trim());
    fd.set("terms_catalog_version_id", draft.terms_catalog_version_id.trim());
    fd.set("status", draft.status);
    fd.set("notes", draft.notes.trim());
    fd.set("send_invite", sendInvite ? "true" : "false");

    setError(null);
    setCreateOverlay({
      phase: "pending",
      title: "Creating company…",
      detail: sendInvite
        ? "Saving the company record, preparing the contract, and sending the invite. Please wait."
        : "Saving the company record and preparing the contract. Please wait.",
    });

    startTransition(() => {
      void (async () => {
        const res = await registerCompanyAction(fd);
        if (!res.ok) {
          setError(res.error);
          setCreateOverlay({
            phase: "error",
            title: "Could not create company",
            detail: res.error,
          });
          return;
        }
        const notices = [res.inviteWarning, res.eSignWarning].filter(Boolean);
        setCreateOverlay({
          phase: "success",
          title: "Company created",
          detail: notices.length
            ? notices.join(" ")
            : res.esignEnvelopeId
              ? "Opening the contract for signature…"
              : "The company is in the directory.",
        });
        onRegistered?.(notices.length ? notices.join(" ") : undefined);
        clearAfterSuccess();
        if (draftId) {
          removeCollectionDraft(REGISTER_COMPANY_DRAFT_COLLECTION, draftId);
          onDraftsChange?.();
        }
        window.setTimeout(() => {
          setCreateOverlay(null);
          onOpenChange(false);
          if (res.esignEnvelopeId) {
            router.push(`/super-admin/esign/${res.esignEnvelopeId}`);
          }
        }, notices.length || res.esignEnvelopeId ? 900 : 600);
      })();
    });
  }, [draft, sendInvite, billingEmailSameAsPrimary, signatoryEmailSameAsPrimary, publishedTerms.length, onOpenChange, onRegistered, router, clearAfterSuccess, draftId, onDraftsChange]);

  return (
    <>
      <FormModalShell
        open={open && Boolean(draftId)}
        titleId="register-company-title"
        title="Register company"
        description="Parent company, registered office, primary contact, commercial terms, then review. Branding is added in rental onboarding."
        headerExtra={<CompanyStepProgress step={step} labels={STEP_LABELS} />}
        pending={busy}
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
            <button type="button" className={btnGhost} disabled={busy} onClick={requestClose}>
              Cancel
            </button>
            <div className="flex flex-wrap gap-3">
              {step > 0 ? (
                <button type="button" className={btnGhost} disabled={busy} onClick={goBack}>
                  Back
                </button>
              ) : null}
              {step < STEP_LABELS.length - 1 ? (
                <button type="button" className={btnContinue} disabled={busy} onClick={goNext}>
                  Continue
                </button>
              ) : (
                <button type="button" className={btnContinue} disabled={busy} onClick={submit}>
                  {creating ? "Creating…" : "Create company"}
                </button>
              )}
            </div>
          </>
        }
      >
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Parent company</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Legal name for the contract. Optional Companies House number. The rental admin can upload a logo later
                  during onboarding.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="co-name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Company name *
                  </label>
                  <input
                    id="co-name"
                    value={draft.name}
                    onChange={(e) => patch("name", e.target.value)}
                    autoComplete="organization"
                    className={inputClass()}
                    placeholder="Registered name"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="co-legal" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Legal name
                  </label>
                  <input
                    id="co-legal"
                    value={draft.legal_name}
                    onChange={(e) => patch("legal_name", e.target.value)}
                    className={inputClass()}
                    placeholder="As on Companies House"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="co-number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Company number
                  </label>
                  <input
                    id="co-number"
                    value={draft.company_number}
                    onChange={(e) => patch("company_number", e.target.value)}
                    className={inputClass()}
                    placeholder="Companies House number"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Registered office (UK)</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Companies House style registered address. All fields optional unless you need them on file now.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="reg-l1" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Address line 1
                  </label>
                  <input
                    id="reg-l1"
                    value={draft.registered_address_line1}
                    onChange={(e) => patch("registered_address_line1", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="reg-l2" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Address line 2
                  </label>
                  <input
                    id="reg-l2"
                    value={draft.registered_address_line2}
                    onChange={(e) => patch("registered_address_line2", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-town" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Town / city
                  </label>
                  <input
                    id="reg-town"
                    value={draft.registered_town}
                    onChange={(e) => patch("registered_town", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-county" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    County
                  </label>
                  <input
                    id="reg-county"
                    value={draft.registered_county}
                    onChange={(e) => patch("registered_county", e.target.value)}
                    className={inputClass()}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1 sm:max-w-xs">
                  <label htmlFor="reg-pc" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Postcode
                  </label>
                  <input
                    id="reg-pc"
                    value={draft.registered_postcode}
                    onChange={(e) => patch("registered_postcode", e.target.value)}
                    autoComplete="postal-code"
                    className={inputClass()}
                    placeholder="e.g. SW1A 1AA"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Primary contact</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Main point of contact for this company account.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="pc-fn" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    First name *
                  </label>
                  <input
                    id="pc-fn"
                    value={draft.primary_contact_first_name}
                    onChange={(e) => patch("primary_contact_first_name", e.target.value)}
                    autoComplete="given-name"
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="pc-ln" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Last name *
                  </label>
                  <input
                    id="pc-ln"
                    value={draft.primary_contact_last_name}
                    onChange={(e) => patch("primary_contact_last_name", e.target.value)}
                    autoComplete="family-name"
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="pc-dob" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Date of birth *
                  </label>
                  <input
                    id="pc-dob"
                    value={draft.primary_contact_dob}
                    onChange={(e) => patch("primary_contact_dob", e.target.value)}
                    type="date"
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="pc-phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Phone number *
                  </label>
                  <input
                    id="pc-phone"
                    value={draft.primary_contact_phone}
                    onChange={(e) => patch("primary_contact_phone", e.target.value)}
                    type="tel"
                    autoComplete="tel"
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="pc-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Email *
                  </label>
                  <input
                    id="pc-email"
                    value={draft.primary_contact_email}
                    onChange={(e) => patch("primary_contact_email", e.target.value)}
                    type="email"
                    autoComplete="email"
                    className={inputClass()}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Commercial terms & signatory</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Stored on the parent contract. Optional pricing preset seeds amounts. E-sign is sent separately from the
                  company list when e-sign SMTP is configured.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Pricing preset</label>
                  <div className="relative">
                    <select
                      value={draft.pricing_preset_id}
                      onChange={(e) => {
                        const v = e.target.value;
                        const pr = presets.find((p) => p.id === v);
                        setDraft((d) => ({
                          ...d,
                          pricing_preset_id: v,
                          ...(pr?.pricing_model_type
                            ? { pricing_model: String(pr.pricing_model_type).trim() }
                            : {}),
                        }));
                      }}
                      className={selectClass()}
                    >
                      <option value="">None — set pricing model and amounts yourself</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Optional saved template (amounts, currency, billing rhythm) from Super admin → Contract pricing presets.
                    If you use one, you do not pick pricing model separately—it is defined by that preset.
                  </p>
                </div>
                {publishedTerms.length > 0 ? (
                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <label htmlFor="reg-terms-version" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Terms &amp; conditions (published) *
                        </label>
                        <div className="relative">
                          <select
                            id="reg-terms-version"
                            value={draft.terms_catalog_version_id}
                            onChange={(e) => {
                              patch("terms_catalog_version_id", e.target.value);
                              setTcReviewOpen(false);
                              setTcReview(null);
                              setTcReviewErr(null);
                            }}
                            className={selectClass(!draft.terms_catalog_version_id.trim())}
                          >
                            <option value="">Select version…</option>
                            {publishedTerms.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.version_label} — {t.title}
                              </option>
                            ))}
                          </select>
                          <SelectChevron />
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${btnGhost} h-11 shrink-0`}
                        disabled={!draft.terms_catalog_version_id.trim() || busy}
                        onClick={openTermsReview}
                      >
                        Review
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Open <span className="font-medium text-zinc-600 dark:text-zinc-300">Review</span> to read the full
                      text. A full copy is frozen on the contract for audits; later catalog changes do not alter signed
                      agreements.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Billing / main email</label>
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={billingEmailSameAsPrimary}
                      onChange={(e) => setBillingSameAsPrimary(e.target.checked)}
                      className="size-4 rounded border-zinc-300 text-rph-rail focus:ring-rph-rail/25 dark:border-zinc-600"
                    />
                    Same as primary contact email
                  </label>
                  <input
                    type="email"
                    value={
                      billingEmailSameAsPrimary ? draft.primary_contact_email : draft.billing_email
                    }
                    onChange={(e) => patch("billing_email", e.target.value)}
                    className={inputClass()}
                    placeholder="Accounts mailbox (optional)"
                    disabled={billingEmailSameAsPrimary}
                    readOnly={billingEmailSameAsPrimary}
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Optional field on the company record. We do not send invoice emails to this address yet; in-app billing
                    alerts go to users with owner, admin, or finance access. Account invite and contract e-sign use the
                    primary contact email above—not this field.
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-contract-type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Contract type
                  </label>
                  <input
                    id="reg-contract-type"
                    value={draft.contract_type}
                    onChange={(e) => patch("contract_type", e.target.value)}
                    className={`${inputClass()} font-mono`}
                    placeholder="rental_agreement"
                    autoComplete="off"
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Short code stored on the contract for reporting and templates (free text in the database). Default{" "}
                    <span className="font-mono">rental_agreement</span> is the standard B2B fleet rental. Change only if
                    legal uses another agreement category.
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-pricing-model" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Pricing model
                  </label>
                  {draft.pricing_preset_id.trim() ? (
                    <>
                      <input
                        id="reg-pricing-model"
                        readOnly
                        tabIndex={-1}
                        value={pricingModelOptionLabel(draft.pricing_model)}
                        className={`${inputClass()} cursor-default bg-zinc-50 text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200`}
                      />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Taken from the selected preset. Set pricing preset to &quot;None&quot; if you need to choose a
                        different model for this company.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <select
                          id="reg-pricing-model"
                          value={draft.pricing_model}
                          onChange={(e) => patch("pricing_model", e.target.value)}
                          className={selectClass()}
                        >
                          {!PRICING_MODEL_OPTIONS.some((o) => o.value === draft.pricing_model) && draft.pricing_model ? (
                            <option value={draft.pricing_model}>{draft.pricing_model} (current value)</option>
                          ) : null}
                          {PRICING_MODEL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <SelectChevron />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Only when no preset is selected: how recurring charges are structured on the contract. Default is a
                        single flat fee per billing period (
                        <span className="font-mono">fixed_monthly</span>).
                      </p>
                    </>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Billing frequency</label>
                  <div className="relative">
                    <select
                      value={draft.billing_frequency}
                      onChange={(e) => patch("billing_frequency", e.target.value)}
                      className={selectClass()}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </select>
                    <SelectChevron />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Start date</label>
                  <input
                    type="date"
                    value={draft.contract_start_date}
                    onChange={(e) => patch("contract_start_date", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Currency</label>
                  <input
                    value={draft.currency}
                    onChange={(e) => patch("currency", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Payment terms (days)</label>
                  <input
                    value={draft.payment_terms_days}
                    onChange={(e) => patch("payment_terms_days", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Billing anchor day (1–28)</label>
                  <input
                    value={draft.billing_anchor_day}
                    onChange={(e) => patch("billing_anchor_day", e.target.value)}
                    className={inputClass()}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recurring amount</label>
                  <input
                    value={draft.recurring_amount}
                    onChange={(e) => patch("recurring_amount", e.target.value)}
                    className={inputClass()}
                    placeholder="e.g. 500 (before tax)"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Signatory (optional)</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Defaults to primary contact for e-sign if blank.</p>
                </div>
                <div className="space-y-1">
                  <input
                    value={draft.signatory_name}
                    onChange={(e) => patch("signatory_name", e.target.value)}
                    className={inputClass()}
                    placeholder="Signatory name"
                  />
                </div>
                <div className="space-y-1">
                  <input
                    value={draft.signatory_title}
                    onChange={(e) => patch("signatory_title", e.target.value)}
                    className={inputClass()}
                    placeholder="Title"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={signatoryEmailSameAsPrimary}
                      onChange={(e) => setSignatorySameAsPrimary(e.target.checked)}
                      className="size-4 rounded border-zinc-300 text-rph-rail focus:ring-rph-rail/25 dark:border-zinc-600"
                    />
                    Signatory email same as primary contact email
                  </label>
                  <input
                    type="email"
                    value={
                      signatoryEmailSameAsPrimary ? draft.primary_contact_email : draft.signatory_email
                    }
                    onChange={(e) => patch("signatory_email", e.target.value)}
                    className={inputClass()}
                    placeholder="Signatory email"
                    disabled={signatoryEmailSameAsPrimary}
                    readOnly={signatoryEmailSameAsPrimary}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Review and status</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Confirm details before saving the company record.</p>
              </div>
              <div className="space-y-1 sm:max-w-xs">
                <label htmlFor="co-status" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Account status
                </label>
                <div className="relative">
                  <select
                    id="co-status"
                    value={draft.status}
                    onChange={(e) => patch("status", e.target.value)}
                    className={selectClass()}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <SelectChevron />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="co-notes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Internal notes
                </label>
                <textarea
                  id="co-notes"
                  value={draft.notes}
                  onChange={(e) => patch("notes", e.target.value)}
                  rows={2}
                  className={inputClass()}
                  placeholder="Optional"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="mt-1 size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/25 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="font-semibold">Invite primary contact before the agreement is active (override)</span>
                  <span className="mt-1 block font-normal text-zinc-500 dark:text-zinc-400">
                    Standard flow: the primary contact is invited <span className="font-medium text-zinc-600 dark:text-zinc-300">after</span>{" "}
                    the contract is signed (native e-sign). Check this only if e-sign is failing and you need them to have
                    an Auth account early—they will see “Agreement not active yet” until the contract becomes active, then
                    onboarding. With legacy bootstrap signing, the default is to invite immediately. You can always send or
                    resend invites from the company list.
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Summary</p>
                <dl className="mt-2 space-y-2 text-zinc-600 dark:text-zinc-400">
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Company</dt>
                    <dd className="mt-0.5">{draft.name.trim() || "—"}</dd>
                    {draft.company_number.trim() ? <dd className="font-mono text-xs">No. {draft.company_number}</dd> : null}
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Registered office</dt>
                    <dd className="mt-0.5 whitespace-pre-line">
                      {[
                        draft.registered_address_line1,
                        draft.registered_address_line2,
                        [draft.registered_town, draft.registered_county].filter(Boolean).join(", "),
                        draft.registered_postcode,
                      ]
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .join("\n") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Primary contact</dt>
                    <dd className="mt-0.5">
                      {[draft.primary_contact_first_name, draft.primary_contact_last_name].filter(Boolean).join(" ") || "—"}
                    </dd>
                    <dd>DOB: {draft.primary_contact_dob || "—"}</dd>
                    <dd>{draft.primary_contact_phone || "—"}</dd>
                    <dd>{draft.primary_contact_email || "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
      </FormModalShell>

      {tcReviewOpen ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tc-review-title"
            className="relative z-[1] flex max-h-[min(85vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700 sm:px-5">
              <div className="min-w-0">
                <h3 id="tc-review-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Terms &amp; conditions preview
                </h3>
                {tcReview ? (
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{tcReview.version_label}</span>
                    {" — "}
                    {tcReview.title}
                  </p>
                ) : tcReviewErr ? null : (
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => setTcReviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              {tcReviewErr ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {tcReviewErr}
                </p>
              ) : null}
              {tcReviewPending && !tcReview && !tcReviewErr ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading terms…</p>
              ) : null}
              {tcReview ? <TermsRichViewer html={tcReview.body} /> : null}
            </div>
          </div>
        </div>
      ) : null}

      <ActionStatusOverlay
        state={createOverlay}
        onDismiss={() => setCreateOverlay(null)}
      />
    </>
  );
}
