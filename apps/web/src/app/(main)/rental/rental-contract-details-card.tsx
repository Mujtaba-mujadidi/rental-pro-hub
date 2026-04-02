"use client";

import { useMemo, useState, useTransition } from "react";
import { requestRentalCompanyContractChangeAction } from "@/app/actions/rental-company-contract";

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

export function RentalContractDetailsCard({
  company,
  hasPendingChange,
  canRequestContractChange,
}: {
  company: CompanyDetails;
  hasPendingChange: boolean;
  /** Matches RLS: only owner/admin may insert contract change requests. */
  canRequestContractChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
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
  });

  const contractStatusLabel = useMemo(
    () => (hasPendingChange ? "Pending renewal signature" : company.contract_status === "active" ? "Active" : company.contract_status),
    [hasPendingChange, company.contract_status],
  );

  function patch<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submitRequest() {
    setError(null);
    setOk(null);
    const fd = new FormData();
    (Object.keys(draft) as Array<keyof typeof draft>).forEach((k) => fd.set(k, draft[k]));
    startTransition(() => {
      void (async () => {
        const res = await requestRentalCompanyContractChangeAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk(
          "Amendment request submitted. Parent company legal fields update only after signature; your primary operational unit is updated only for trading name and contact fields that mirror the contract.",
        );
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
          A contract change is already pending signature. New changes are locked until completion.
        </p>
      ) : null}
      {error ? <p className="mt-3 rph-alert-error">{error}</p> : null}
      {ok ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
          {ok}
        </p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 sm:p-6">
          <button type="button" className="absolute inset-0 bg-black/50" onMouseDown={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[1] w-full max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Request contract change</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Changes to your main/default subcompany and parent company will apply only after new contract signature.
            </p>
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
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={submitRequest}>
                {pending ? "Submitting…" : "Submit for signature"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
