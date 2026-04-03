"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { registerCompanyAction, getRegisterCompanyInviteDefaultsAction } from "@/app/actions/admin-companies";
import { listPricingPresetsForRegisterAction } from "@/app/actions/contract-presets";
import { listPublishedTermsForRegisterAction } from "@/app/actions/contract-terms";
import { CompanyStepProgress } from "@/components/forms/company-step-progress";

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

export type RegisterCompanyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the company row is saved. Passes optional message if invite was skipped or failed. */
  onRegistered?: (inviteNotice?: string) => void;
};

export function RegisterCompanyModal({ open, onOpenChange, onRegistered }: RegisterCompanyModalProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [publishedTerms, setPublishedTerms] = useState<{ id: string; version_label: string; title: string }[]>([]);
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setDraft({ ...initialDraft });
    void Promise.all([
      listPricingPresetsForRegisterAction().then((r) => {
        if (r.ok) setPresets(r.presets);
      }),
      listPublishedTermsForRegisterAction().then((r) => {
        if (r.ok) setPublishedTerms(r.versions);
      }),
      getRegisterCompanyInviteDefaultsAction().then((d) => {
        if (d.ok) setSendInvite(d.defaultSendInvite);
      }),
    ]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onOpenChange]);

  const close = useCallback(() => {
    if (!pending) onOpenChange(false);
  }, [pending, onOpenChange]);

  const patch = useCallback(<K extends keyof typeof initialDraft>(field: K, value: (typeof initialDraft)[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
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
    fd.set("billing_email", draft.billing_email.trim());
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
    fd.set("billing_email", draft.billing_email.trim());
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
    fd.set("signatory_email", draft.signatory_email.trim());
    fd.set("pricing_preset_id", draft.pricing_preset_id.trim());
    fd.set("terms_catalog_version_id", draft.terms_catalog_version_id.trim());
    fd.set("status", draft.status);
    fd.set("notes", draft.notes.trim());
    fd.set("send_invite", sendInvite ? "true" : "false");

    startTransition(() => {
      void (async () => {
        const res = await registerCompanyAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onRegistered?.(res.inviteWarning);
        onOpenChange(false);
      })();
    });
  }, [draft, sendInvite, publishedTerms.length, onOpenChange, onRegistered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close dialog"
        disabled={pending}
        onMouseDown={() => close()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-company-title"
        className="relative z-[1] flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-200/90 px-6 pb-4 pt-6 dark:border-zinc-700 sm:px-10 sm:pt-10">
          <h2 id="register-company-title" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Register company
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Parent company, registered office, primary contact, commercial terms, then review. Branding is added in rental
            onboarding.
          </p>
          <CompanyStepProgress step={step} labels={STEP_LABELS} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
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
                  company list when DocuSeal is configured.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Pricing preset</label>
                  <select
                    value={draft.pricing_preset_id}
                    onChange={(e) => patch("pricing_preset_id", e.target.value)}
                    className={inputClass()}
                  >
                    <option value="">None</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {publishedTerms.length > 0 ? (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Terms &amp; conditions (published) *
                    </label>
                    <select
                      value={draft.terms_catalog_version_id}
                      onChange={(e) => patch("terms_catalog_version_id", e.target.value)}
                      className={inputClass(!draft.terms_catalog_version_id.trim())}
                    >
                      <option value="">Select version…</option>
                      {publishedTerms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.version_label} — {t.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      A full copy is frozen on the contract for audits; later catalog changes do not alter signed agreements.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Billing / main email</label>
                  <input
                    type="email"
                    value={draft.billing_email}
                    onChange={(e) => patch("billing_email", e.target.value)}
                    className={inputClass()}
                    placeholder="Accounts mailbox (optional)"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contract type</label>
                  <input
                    value={draft.contract_type}
                    onChange={(e) => patch("contract_type", e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Pricing model</label>
                  <input
                    value={draft.pricing_model}
                    onChange={(e) => patch("pricing_model", e.target.value)}
                    className={inputClass()}
                    placeholder="e.g. fixed_monthly"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Billing frequency</label>
                  <select
                    value={draft.billing_frequency}
                    onChange={(e) => patch("billing_frequency", e.target.value)}
                    className={inputClass()}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
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
                  <input
                    type="email"
                    value={draft.signatory_email}
                    onChange={(e) => patch("signatory_email", e.target.value)}
                    className={inputClass()}
                    placeholder="Signatory email"
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
                <select
                  id="co-status"
                  value={draft.status}
                  onChange={(e) => patch("status", e.target.value)}
                  className={inputClass()}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
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
                  <span className="font-semibold">Send invite email to primary contact now</span>
                  <span className="mt-1 block font-normal text-zinc-500 dark:text-zinc-400">
                    When DocuSeal e-sign is enabled, this defaults off so the primary contact is invited after the contract
                    is signed (or you can check this to invite immediately). With legacy signing, the default is on. You can
                    always send an invite later from the company list.
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
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700 sm:px-10">
          <button type="button" className={btnGhost} disabled={pending} onClick={close}>
            Cancel
          </button>
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={pending} onClick={goBack}>
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button type="button" className={btnContinue} disabled={pending} onClick={goNext}>
                Continue
              </button>
            ) : (
              <button type="button" className={btnContinue} disabled={pending} onClick={submit}>
                {pending ? "Saving…" : "Save company"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
