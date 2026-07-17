"use client";

import DOMPurify from "isomorphic-dompurify";
import { useCallback, useMemo, useState, useTransition } from "react";
import { requestRentalCompanyContractChangeAction } from "@/app/actions/rental-company-contract";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { rentalContractCopy } from "@/lib/rental-contract-copy";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

type CompanyDetails = {
  id: string;
  name: string | null;
  legal_name: string | null;
  company_number: string | null;
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_town: string | null;
  registered_county: string | null;
  registered_postcode: string | null;
  country: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_dob: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  notes: string | null;
  contract_status: string;
  contract_version: number;
};

type TermsSnap = {
  version_label?: unknown;
  title?: unknown;
  body?: unknown;
};

type ChangeDraft = {
  transition_type: "detail_change" | "new_legal_entity";
  name: string;
  legal_name: string;
  company_number: string;
  registered_address_line1: string;
  registered_address_line2: string;
  registered_town: string;
  registered_county: string;
  registered_postcode: string;
  country: string;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  primary_contact_dob: string;
  primary_contact_phone: string;
  primary_contact_email: string;
  notes: string;
  signatory_name: string;
  signatory_title: string;
  signatory_email: string;
};

function companyBaseline(company: CompanyDetails): ChangeDraft {
  return {
    transition_type: "detail_change",
    name: company.name ?? "",
    legal_name: company.legal_name ?? "",
    company_number: company.company_number ?? "",
    registered_address_line1: company.registered_address_line1 ?? "",
    registered_address_line2: company.registered_address_line2 ?? "",
    registered_town: company.registered_town ?? "",
    registered_county: company.registered_county ?? "",
    registered_postcode: company.registered_postcode ?? "",
    country: company.country ?? "GB",
    primary_contact_first_name: company.primary_contact_first_name ?? "",
    primary_contact_last_name: company.primary_contact_last_name ?? "",
    primary_contact_dob: company.primary_contact_dob ?? "",
    primary_contact_phone: company.primary_contact_phone ?? "",
    primary_contact_email: company.primary_contact_email ?? "",
    notes: company.notes ?? "",
    signatory_name: "",
    signatory_title: "",
    signatory_email: "",
  };
}

export function RentalContractDetailsCard({
  company,
  termsSnapshot,
  hasPendingChange,
  canRequestContractChange,
}: {
  company: CompanyDetails;
  /** Frozen terms from the signed contract version (not the live catalog). */
  termsSnapshot: Record<string, unknown> | null;
  hasPendingChange: boolean;
  /** Matches RLS: only owner/admin may insert contract change requests. */
  canRequestContractChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const baseline = useMemo(() => companyBaseline(company), [company]);
  const [draft, setDraft] = useState<ChangeDraft>(baseline);

  const applySnapshot = useCallback((s: ChangeDraft) => {
    setDraft(s);
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
    draftKey: `contract-change:${company.id}`,
    open,
    snapshot: draft,
    baseline,
    pending,
    applySnapshot,
    onClose: () => setOpen(false),
  });

  const contractStatusLabel = useMemo(
    () =>
      hasPendingChange
        ? "Change in progress (review / signature)"
        : company.contract_status === "active"
          ? "Active"
          : company.contract_status,
    [hasPendingChange, company.contract_status],
  );

  function patch<K extends keyof ChangeDraft>(key: K, value: ChangeDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submitRequest() {
    setError(null);
    setOk(null);
    const fd = new FormData();
    (Object.keys(draft) as Array<keyof ChangeDraft>).forEach((k) => fd.set(k, draft[k]));
    startTransition(() => {
      void (async () => {
        const res = await requestRentalCompanyContractChangeAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk(rentalContractCopy.legalChangeAfterSignature);
        clearAfterSuccess();
        setOpen(false);
      })();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Parent company · contract</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Legal entity on the agreement — version {company.contract_version} · Status:{" "}
            <span className="font-semibold">{contractStatusLabel}</span>
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-xl">{rentalContractCopy.parentVsPrimaryShort}</p>
        </div>
        {canRequestContractChange ? (
          <button
            type="button"
            disabled={hasPendingChange || pending}
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
          >
            Request legal detail change
          </button>
        ) : (
          <p className="max-w-sm text-right text-xs text-slate-500 dark:text-slate-400">
            Only owners and admins can request legal or contract changes. Ask an admin if you need an amendment.
          </p>
        )}
      </div>
      {hasPendingChange ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          A contract change is already in progress. New changes are locked until completion.
        </p>
      ) : null}

      {(() => {
        const snap = termsSnapshot as TermsSnap | null;
        const label =
          typeof snap?.version_label === "string" && snap.version_label.trim() ? snap.version_label.trim() : null;
        const title = typeof snap?.title === "string" && snap.title.trim() ? snap.title.trim() : null;
        const body = typeof snap?.body === "string" && snap.body.trim() ? snap.body.trim() : null;
        if (!label && !body) return null;
        const bodyIsHtml = body ? /<[a-z][\s\S]*>/i.test(body) : false;
        const safeHtml =
          body && bodyIsHtml
            ? DOMPurify.sanitize(body, {
                ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "ul", "ol", "li", "a", "span", "div"],
                ALLOWED_ATTR: ["href", "target", "rel"],
              })
            : "";
        return (
          <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/40">
            <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-100">
              Terms you agreed to
              {label ? <span className="ml-1 font-normal text-slate-600 dark:text-slate-400">(version {label})</span> : null}
            </summary>
            {title ? <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">{title}</p> : null}
            {body && bodyIsHtml && safeHtml ? (
              <div
                className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed text-slate-700 dark:text-slate-300 [&_a]:text-rph-rail [&_a]:underline [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            ) : null}
            {body && !bodyIsHtml ? (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300">
                {body}
              </pre>
            ) : null}
            {!body ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Full text was not stored for this contract.</p>
            ) : null}
          </details>
        );
      })()}
      {error ? <p className="mt-3 rph-alert-error">{error}</p> : null}
      {ok ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
          {ok}
        </p>
      ) : null}

      <FormModalShell
        open={open}
        titleId="contract-change-title"
        title="Request contract change"
        description={rentalContractCopy.legalChangeAfterSignature}
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
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
              disabled={pending}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={pending}
              onClick={submitRequest}
            >
              {pending ? "Submitting…" : "Submit change request"}
            </button>
          </>
        }
      >
            <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Type of change</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="transition_type"
                  checked={draft.transition_type === "detail_change"}
                  onChange={() => patch("transition_type", "detail_change")}
                />
                Update legal details (same legal entity)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="transition_type"
                  checked={draft.transition_type === "new_legal_entity"}
                  onChange={() => patch("transition_type", "new_legal_entity")}
                />
                New legal entity replaces the current parent company
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={draft.name} onChange={(e) => patch("name", e.target.value)} className={inputClass()} placeholder="Company name *" />
              <input value={draft.legal_name} onChange={(e) => patch("legal_name", e.target.value)} className={inputClass()} placeholder="Legal name" />
              <input value={draft.company_number} onChange={(e) => patch("company_number", e.target.value)} className={inputClass()} placeholder="Company number" />
              <input value={draft.registered_postcode} onChange={(e) => patch("registered_postcode", e.target.value)} className={inputClass()} placeholder="Postcode" />
              <input value={draft.registered_address_line1} onChange={(e) => patch("registered_address_line1", e.target.value)} className={inputClass()} placeholder="Address line 1" />
              <input value={draft.registered_address_line2} onChange={(e) => patch("registered_address_line2", e.target.value)} className={inputClass()} placeholder="Address line 2" />
              <input value={draft.registered_town} onChange={(e) => patch("registered_town", e.target.value)} className={inputClass()} placeholder="Town / city" />
              <input value={draft.registered_county} onChange={(e) => patch("registered_county", e.target.value)} className={inputClass()} placeholder="County" />
              <input value={draft.primary_contact_first_name} onChange={(e) => patch("primary_contact_first_name", e.target.value)} className={inputClass()} placeholder="Primary first name *" />
              <input value={draft.primary_contact_last_name} onChange={(e) => patch("primary_contact_last_name", e.target.value)} className={inputClass()} placeholder="Primary last name *" />
              <input type="date" value={draft.primary_contact_dob} onChange={(e) => patch("primary_contact_dob", e.target.value)} className={inputClass()} />
              <input value={draft.primary_contact_phone} onChange={(e) => patch("primary_contact_phone", e.target.value)} className={inputClass()} placeholder="Primary phone *" />
              <input type="email" value={draft.primary_contact_email} onChange={(e) => patch("primary_contact_email", e.target.value)} className={`${inputClass()} sm:col-span-2`} placeholder="Primary email *" />
              <textarea value={draft.notes} onChange={(e) => patch("notes", e.target.value)} rows={2} className={`${inputClass()} sm:col-span-2`} placeholder="Notes" />
              <input value={draft.signatory_name} onChange={(e) => patch("signatory_name", e.target.value)} className={inputClass()} placeholder="Signatory name (optional)" />
              <input value={draft.signatory_title} onChange={(e) => patch("signatory_title", e.target.value)} className={inputClass()} placeholder="Signatory title (optional)" />
              <input type="email" value={draft.signatory_email} onChange={(e) => patch("signatory_email", e.target.value)} className={`${inputClass()} sm:col-span-2`} placeholder="Signatory email (optional)" />
            </div>
      </FormModalShell>
    </div>
  );
}
