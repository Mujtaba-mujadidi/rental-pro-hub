"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { registerCompanyAction } from "@/app/actions/admin-companies";

const STEP_LABELS = ["Company", "Registered office", "Primary contact", "Review"] as const;

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

function CompanyRegisterStepProgress({ step, labels }: { step: number; labels: readonly string[] }) {
  const displayStep = step + 1;

  return (
    <nav className="mb-2" aria-label="Register company steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step {displayStep} of {labels.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {labels.map((label, i) => {
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
                  {done ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    n
                  )}
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
      <p className="mt-4 text-center text-sm font-semibold text-orange-700 dark:text-orange-400 sm:hidden">
        {labels[step]}
      </p>
    </nav>
  );
}

const initialDraft = {
  name: "",
  company_number: "",
  registered_address_line1: "",
  registered_address_line2: "",
  registered_town: "",
  registered_county: "",
  registered_postcode: "",
  has_logo: false,
  primary_contact_first_name: "",
  primary_contact_last_name: "",
  primary_contact_dob: "",
  primary_contact_phone: "",
  primary_contact_email: "",
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setSendInvite(true);
    setDraft({ ...initialDraft });
    setLogoFile(null);
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
      if (!draft.name.trim()) return false;
      if (draft.has_logo && (!logoFile || logoFile.size === 0)) return false;
      return true;
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
    return true;
  }, [step, draft, logoFile]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === 0 && !draft.name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (step === 0 && draft.has_logo && (!logoFile || logoFile.size === 0)) {
      setError("Choose a logo file or uncheck “Company has a logo”.");
      return;
    }
    if (step === 2 && !canGoNext()) {
      setError("Fill in all primary contact fields.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }, [step, draft, logoFile, canGoNext]);

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
    if (draft.has_logo && (!logoFile || logoFile.size === 0)) {
      setError("Choose a logo file or uncheck “Company has a logo”.");
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

    const fd = new FormData();
    fd.set("name", draft.name.trim());
    fd.set("company_number", draft.company_number.trim());
    fd.set("registered_address_line1", draft.registered_address_line1.trim());
    fd.set("registered_address_line2", draft.registered_address_line2.trim());
    fd.set("registered_town", draft.registered_town.trim());
    fd.set("registered_county", draft.registered_county.trim());
    fd.set("registered_postcode", draft.registered_postcode.trim());
    fd.set("country", draft.country.trim() || "GB");
    fd.set("has_logo", draft.has_logo ? "true" : "false");
    fd.set("primary_contact_first_name", draft.primary_contact_first_name.trim());
    fd.set("primary_contact_last_name", draft.primary_contact_last_name.trim());
    fd.set("primary_contact_dob", draft.primary_contact_dob.trim());
    fd.set("primary_contact_phone", draft.primary_contact_phone.trim());
    fd.set("primary_contact_email", draft.primary_contact_email.trim());
    fd.set("status", draft.status);
    fd.set("notes", draft.notes.trim());
    fd.set("send_invite", sendInvite ? "true" : "false");

    if (draft.has_logo && logoFile) {
      fd.set("logo", logoFile);
    }

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
  }, [draft, logoFile, sendInvite, onOpenChange, onRegistered]);

  if (!open) return null;

  const fileInputClass = [
    inputClass(),
    "py-2",
    "file:mr-3 file:rounded-lg file:border-0 file:bg-rph-rail file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-rph-rail-hover dark:file:bg-rph-rail-soft",
  ].join(" ");

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
            Company and branding, registered office, primary contact, then review.
          </p>
          <CompanyRegisterStepProgress step={step} labels={STEP_LABELS} />
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
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Company and logo</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Registered name, Companies House number (optional), and an optional brand mark.
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

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
                <input
                  type="checkbox"
                  checked={draft.has_logo}
                  onChange={(e) => {
                    patch("has_logo", e.target.checked);
                    if (!e.target.checked) setLogoFile(null);
                  }}
                  className="mt-1 size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/25 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="font-semibold">Company has a logo</span>
                  <span className="mt-1 block font-normal text-zinc-500 dark:text-zinc-400">
                    PNG, JPEG, or WebP up to 2&nbsp;MB.
                  </span>
                </span>
              </label>

              {draft.has_logo ? (
                <div className="space-y-1">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo file</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={fileInputClass}
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : null}
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
                  <span className="font-semibold">Send invite email to primary contact</span>
                  <span className="mt-1 block font-normal text-zinc-500 dark:text-zinc-400">
                    They get a link to set a password and access the rental company area. Uncheck to save the record only
                    and invite later from the company list.
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
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Logo</dt>
                    <dd>{draft.has_logo ? (logoFile ? logoFile.name : "—") : "No"}</dd>
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
