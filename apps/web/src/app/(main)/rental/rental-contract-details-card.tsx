"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  discardRentalContractChangeDraftAction,
  saveRentalCompanyFormattingDetailsAction,
  saveRentalContractChangeDraftAction,
  submitRentalContractChangeDraftAction,
} from "@/app/actions/rental-company-contract";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  assertContractChangeHasDisplayChanges,
  assertContractChangeHasSubstantiveChanges,
} from "@/lib/companies/contract-change-form";
import {
  buildContractChangeDiff,
  companySnapshotForChangeDiff,
  contractChangeDiffDisplayChangedRows,
  contractChangeDiffHasChanges,
  contractChangeDiffHasDisplayChanges,
  postcodeForForm,
  type ContractChangeDiffRow,
  type ContractChangeFieldSnapshot,
} from "@/lib/companies/contract-change-diff";
import { useContractChangeRealtime } from "@/hooks/use-contract-change-realtime";
import { formatUkDate } from "@/lib/datetime/uk";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import type { ContractSignatoryDefaults } from "@/lib/companies/contract-change-signatory";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

type CompanyDetails = ContractChangeFieldSnapshot & {
  id: string;
  contract_status: string;
  contract_version: number;
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

type ServerDraft = {
  id: string;
  transition_type: string;
  proposed_name: string | null;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string | null;
  proposed_primary_contact_first_name: string | null;
  proposed_primary_contact_last_name: string | null;
  proposed_primary_contact_dob: string | null;
  proposed_primary_contact_phone: string | null;
  proposed_primary_contact_email: string | null;
  proposed_notes: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
};

type SubmittedChange = {
  id: string;
  review_status: string;
  review_comment: string | null;
  transition_type: string;
};

function companySnapshotForChangeForm(company: CompanyDetails): ContractChangeFieldSnapshot {
  return companySnapshotForChangeDiff(company);
}

function companyBaseline(company: CompanyDetails, signatoryDefaults: ContractSignatoryDefaults): ChangeDraft {
  return {
    transition_type: "detail_change",
    name: company.name ?? "",
    legal_name: company.legal_name ?? "",
    company_number: company.company_number ?? "",
    registered_address_line1: company.registered_address_line1 ?? "",
    registered_address_line2: company.registered_address_line2 ?? "",
    registered_town: company.registered_town ?? "",
    registered_county: company.registered_county ?? "",
    registered_postcode: postcodeForForm(company.registered_postcode),
    country: company.country ?? "GB",
    primary_contact_first_name: company.primary_contact_first_name ?? "",
    primary_contact_last_name: company.primary_contact_last_name ?? "",
    primary_contact_dob: company.primary_contact_dob ?? "",
    primary_contact_phone: company.primary_contact_phone ?? "",
    primary_contact_email: company.primary_contact_email ?? "",
    notes: company.notes ?? "",
    signatory_name: signatoryDefaults.name,
    signatory_title: "",
    signatory_email: signatoryDefaults.email,
  };
}

function draftFromServer(serverDraft: ServerDraft, signatoryDefaults: ContractSignatoryDefaults): ChangeDraft {
  return {
    transition_type: serverDraft.transition_type === "new_legal_entity" ? "new_legal_entity" : "detail_change",
    name: serverDraft.proposed_name ?? "",
    legal_name: serverDraft.proposed_legal_name ?? "",
    company_number: serverDraft.proposed_company_number ?? "",
    registered_address_line1: serverDraft.proposed_registered_address_line1 ?? "",
    registered_address_line2: serverDraft.proposed_registered_address_line2 ?? "",
    registered_town: serverDraft.proposed_registered_town ?? "",
    registered_county: serverDraft.proposed_registered_county ?? "",
    registered_postcode: postcodeForForm(serverDraft.proposed_registered_postcode),
    country: serverDraft.proposed_country ?? "GB",
    primary_contact_first_name: serverDraft.proposed_primary_contact_first_name ?? "",
    primary_contact_last_name: serverDraft.proposed_primary_contact_last_name ?? "",
    primary_contact_dob: serverDraft.proposed_primary_contact_dob ?? "",
    primary_contact_phone: serverDraft.proposed_primary_contact_phone ?? "",
    primary_contact_email: serverDraft.proposed_primary_contact_email ?? "",
    notes: serverDraft.proposed_notes ?? "",
    signatory_name: serverDraft.signatory_name?.trim() || signatoryDefaults.name,
    signatory_title: serverDraft.signatory_title ?? "",
    signatory_email: serverDraft.signatory_email?.trim() || signatoryDefaults.email,
  };
}

function draftToSnapshot(draft: ChangeDraft): ContractChangeFieldSnapshot {
  return {
    name: draft.name,
    legal_name: draft.legal_name,
    company_number: draft.company_number,
    registered_address_line1: draft.registered_address_line1,
    registered_address_line2: draft.registered_address_line2,
    registered_town: draft.registered_town,
    registered_county: draft.registered_county,
    registered_postcode: draft.registered_postcode,
    country: draft.country,
    primary_contact_first_name: draft.primary_contact_first_name,
    primary_contact_last_name: draft.primary_contact_last_name,
    primary_contact_dob: draft.primary_contact_dob,
    primary_contact_phone: draft.primary_contact_phone,
    primary_contact_email: draft.primary_contact_email,
    notes: draft.notes,
  };
}

function formDataFromDraft(draft: ChangeDraft): FormData {
  const fd = new FormData();
  (Object.keys(draft) as Array<keyof ChangeDraft>).forEach((k) => fd.set(k, draft[k]));
  return fd;
}

function formatPreviewValue(key: ContractChangeDiffRow["key"], value: string): string {
  if (key === "primary_contact_dob" && value && value !== "—") {
    try {
      return formatUkDate(value);
    } catch {
      return value;
    }
  }
  return value;
}

function ChangeDiffPreview({ rows }: { rows: ReturnType<typeof buildContractChangeDiff> }) {
  const changedRows = contractChangeDiffDisplayChangedRows(rows);
  if (!changedRows.length) return null;

  return (
    <div className="mb-4 max-h-52 overflow-auto rounded-lg border border-rph-border">
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Current</th>
            <th className="px-3 py-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {changedRows.map((row) => (
            <tr
              key={row.key}
              className={`border-t border-rph-border ${
                row.changed ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-sky-50/50 dark:bg-sky-950/20"
              }`}
            >
              <td className="px-3 py-2 font-medium text-rph-fg">
                {row.label}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    row.formattingOnly
                      ? "bg-sky-200 text-sky-950 dark:bg-sky-900/60 dark:text-sky-100"
                      : "bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100"
                  }`}
                >
                  {row.formattingOnly ? "Formatting" : "Changed"}
                </span>
              </td>
              <td className="px-3 py-2 text-rph-fg-secondary">{formatPreviewValue(row.key, row.before)}</td>
              <td className="px-3 py-2 font-medium text-rph-fg">{formatPreviewValue(row.key, row.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LastRejection = {
  review_comment: string | null;
  reviewed_at: string | null;
};

type ConfirmKind = "formatting_details" | "submit" | "discard";

export function RentalContractDetailsCard({
  company,
  companyId,
  submittedChange,
  lastRejection,
  serverDraft,
  signatoryDefaults,
  canRequestContractChange,
}: {
  company: CompanyDetails;
  companyId: string;
  submittedChange: SubmittedChange | null;
  lastRejection: LastRejection | null;
  serverDraft: ServerDraft | null;
  signatoryDefaults: ContractSignatoryDefaults;
  canRequestContractChange: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [pending, startTransition] = useTransition();
  const baseline = useMemo(
    () => companyBaseline(company, signatoryDefaults),
    [company, signatoryDefaults],
  );
  const [draft, setDraft] = useState<ChangeDraft>(baseline);

  const hasSubmittedChange = Boolean(submittedChange?.id);
  const hasServerDraft = Boolean(serverDraft?.id);

  const onContractChangeRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useContractChangeRealtime(onContractChangeRefresh, {
    parentCompanyId: companyId,
    enabled: Boolean(companyId) && hasSubmittedChange,
  });

  useEffect(() => {
    if (open) {
      setDraft(serverDraft ? draftFromServer(serverDraft, signatoryDefaults) : baseline);
      setError(null);
    }
  }, [open, serverDraft, baseline, signatoryDefaults]);

  const contractStatusLabel = useMemo(() => {
    if (hasSubmittedChange) return "Change submitted (review / signature)";
    if (hasServerDraft) return "Draft saved";
    if (company.contract_status === "pending_renewal") return "Renewal pending";
    return company.contract_status === "active" ? "Active" : company.contract_status;
  }, [hasSubmittedChange, hasServerDraft, company.contract_status]);

  const companyFormSnapshot = useMemo(() => companySnapshotForChangeForm(company), [company]);

  const diffPreview = useMemo(
    () => buildContractChangeDiff(companyFormSnapshot, draftToSnapshot(draft)),
    [companyFormSnapshot, draft],
  );
  const hasDisplayChanges = contractChangeDiffHasDisplayChanges(diffPreview);
  const hasSubstantiveChanges = contractChangeDiffHasChanges(diffPreview);
  const isFormattingOnlyFlow =
    draft.transition_type === "detail_change" && hasDisplayChanges && !hasSubstantiveChanges;
  const requiresContractAmendment =
    draft.transition_type === "new_legal_entity" || hasSubstantiveChanges;

  function patch<K extends keyof ChangeDraft>(key: K, value: ChangeDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  }

  function validateBeforeSave(): boolean {
    const check = assertContractChangeHasDisplayChanges(companyFormSnapshot, draftToSnapshot(draft));
    if (!check.ok) {
      setError(check.error);
      return false;
    }
    return true;
  }

  function validateBeforeAmendment(): boolean {
    if (!validateBeforeSave()) return false;
    const check = assertContractChangeHasSubstantiveChanges(companyFormSnapshot, draftToSnapshot(draft));
    if (!check.ok) {
      setError(check.error);
      return false;
    }
    return true;
  }

  function runSaveFormattingDetails() {
    const fd = formDataFromDraft(draft);
    startTransition(() => {
      void (async () => {
        const res = await saveRentalCompanyFormattingDetailsAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNotice(rentalContractCopy.legalChangeFormattingSaved);
        setOpen(false);
        router.refresh();
      })();
    });
  }

  function runSaveDraft() {
    const fd = formDataFromDraft(draft);
    startTransition(() => {
      void (async () => {
        const res = await saveRentalContractChangeDraftAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNotice(rentalContractCopy.legalChangeDraftSaved);
        router.refresh();
      })();
    });
  }

  function runSubmitForReview() {
    const fd = formDataFromDraft(draft);
    startTransition(() => {
      void (async () => {
        const res = await submitRentalContractChangeDraftAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNotice(rentalContractCopy.legalChangeSubmitted);
        setOpen(false);
        router.refresh();
      })();
    });
  }

  function runDiscardDraft() {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const res = await discardRentalContractChangeDraftAction();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft(baseline);
        setOpen(false);
        router.refresh();
      })();
    });
  }

  function saveFormattingDetails() {
    setError(null);
    setNotice(null);
    if (!validateBeforeSave()) return;
    setConfirmKind("formatting_details");
  }

  function saveDraft() {
    setError(null);
    setNotice(null);
    if (!validateBeforeAmendment()) return;
    runSaveDraft();
  }

  function submitForReview() {
    setError(null);
    setNotice(null);
    if (!validateBeforeAmendment()) return;
    setConfirmKind("submit");
  }

  function discardDraft() {
    setConfirmKind("discard");
  }

  function handleConfirmDialog() {
    if (!confirmKind) return;
    if (confirmKind === "formatting_details") {
      setConfirmKind(null);
      runSaveFormattingDetails();
      return;
    }
    if (confirmKind === "submit") {
      setConfirmKind(null);
      runSubmitForReview();
      return;
    }
    setConfirmKind(null);
    runDiscardDraft();
  }

  const confirmDialogProps = useMemo(() => {
    switch (confirmKind) {
      case "formatting_details":
        return {
          title: rentalContractCopy.legalChangeFormattingConfirmTitle,
          description: rentalContractCopy.legalChangeFormattingConfirmDescription,
          confirmLabel: rentalContractCopy.legalChangeFormattingSaveConfirmLabel,
        };
      case "submit":
        return {
          title: rentalContractCopy.legalChangeSubmitConfirmTitle,
          description: rentalContractCopy.legalChangeSubmitConfirmDescription,
          confirmLabel: rentalContractCopy.legalChangeSubmitConfirmLabel,
        };
      case "discard":
        return {
          title: rentalContractCopy.legalChangeDiscardConfirmTitle,
          description: rentalContractCopy.legalChangeDiscardConfirmDescription,
          confirmLabel: rentalContractCopy.legalChangeDiscardConfirmLabel,
        };
      default:
        return null;
    }
  }, [confirmKind]);

  const openButtonLabel = hasServerDraft ? "Continue legal change draft" : "Request legal detail change";

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
            disabled={hasSubmittedChange || pending}
            onClick={() => {
              setError(null);
              setNotice(null);
              setOpen(true);
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
          >
            {openButtonLabel}
          </button>
        ) : (
          <p className="max-w-sm text-right text-xs text-slate-500 dark:text-slate-400">
            Only owners and admins can request legal or contract changes. Ask an admin if you need an amendment.
          </p>
        )}
      </div>

      {hasSubmittedChange ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {rentalContractCopy.legalChangeInReview}{" "}
          <span className="font-medium">({submittedChange?.review_status.replaceAll("_", " ")})</span>
        </p>
      ) : null}

      {hasServerDraft && !hasSubmittedChange ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-100">
          You have a saved draft. Continue editing and submit when all details are correct.
        </p>
      ) : null}

      {lastRejection?.review_comment && !hasSubmittedChange && !hasServerDraft ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-sm font-semibold text-red-950 dark:text-red-100">{rentalContractCopy.legalChangeRejectedTitle}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-red-900 dark:text-red-100">
            {lastRejection.review_comment}
          </p>
          <p className="mt-2 text-xs text-red-800/80 dark:text-red-200/80">{rentalContractCopy.legalChangeRejectedHint}</p>
        </div>
      ) : null}

      {notice && !open ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}

      <FormModalShell
        open={open}
        titleId="contract-change-title"
        title="Legal detail change"
        description={
          isFormattingOnlyFlow
            ? "Update how your details are stored. No platform agreement renewal is needed for formatting-only changes."
            : rentalContractCopy.legalChangeAfterSignature
        }
        pending={pending}
        pendingMessage="Saving…"
        showDraftActions={false}
        allowMaximize
        maxWidthClass="max-w-5xl"
        panelHeightClass="h-[min(92vh,56rem)]"
        discardConfirmOpen={false}
        onConfirmDiscard={() => setOpen(false)}
        onCancelDiscard={() => undefined}
        onRequestClose={() => setOpen(false)}
        footer={
          <>
            <div className="flex flex-wrap gap-2">
              {hasServerDraft && requiresContractAmendment ? (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:text-red-200"
                  disabled={pending}
                  onClick={discardDraft}
                >
                  Discard draft
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              {isFormattingOnlyFlow ? (
                <button
                  type="button"
                  className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={pending || !hasDisplayChanges}
                  onClick={saveFormattingDetails}
                >
                  {pending ? "Saving…" : "Save details"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
                    disabled={pending || !requiresContractAmendment}
                    onClick={saveDraft}
                  >
                    {pending ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={pending || !requiresContractAmendment}
                    onClick={submitForReview}
                  >
                    {pending ? "Submitting…" : "Submit for review"}
                  </button>
                </>
              )}
            </div>
          </>
        }
      >
        {error ? <p className="mb-4 rph-alert-error">{error}</p> : null}
        {notice && open ? <p className="mb-4 rph-alert-ok">{notice}</p> : null}

        {!hasDisplayChanges ? (
          <p className="mb-4 rph-alert-warn">{rentalContractCopy.legalChangeNoChanges}</p>
        ) : null}

        {isFormattingOnlyFlow ? (
          <p className="mb-4 rph-alert-warn">{rentalContractCopy.legalChangeFormattingOnly}</p>
        ) : null}

        {requiresContractAmendment && hasSubstantiveChanges ? (
          <p className="mb-4 rph-alert-warn">{rentalContractCopy.legalChangeSubstantiveRequired}</p>
        ) : null}

        {draft.transition_type === "new_legal_entity" && !hasSubstantiveChanges && hasDisplayChanges ? (
          <p className="mb-4 rph-alert-warn">{rentalContractCopy.legalChangeNewEntityRequiresContract}</p>
        ) : null}

        {hasDisplayChanges ? (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-rph-fg">Your proposed changes</h3>
            <ChangeDiffPreview rows={diffPreview} />
          </div>
        ) : null}

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
          {requiresContractAmendment ? (
            <>
              <div className="sm:col-span-2 mt-1 space-y-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Contract signatory</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Defaults to your company owner&apos;s name and email. Change these if someone else will sign the renewal
                  contract.
                </p>
              </div>
              <input
                value={draft.signatory_name}
                onChange={(e) => patch("signatory_name", e.target.value)}
                className={inputClass()}
                placeholder="Signatory name"
              />
              <input
                value={draft.signatory_title}
                onChange={(e) => patch("signatory_title", e.target.value)}
                className={inputClass()}
                placeholder="Signatory title (optional)"
              />
              <input
                type="email"
                value={draft.signatory_email}
                onChange={(e) => patch("signatory_email", e.target.value)}
                className={`${inputClass()} sm:col-span-2`}
                placeholder="Signatory email"
              />
            </>
          ) : null}
        </div>
      </FormModalShell>

      <ConfirmDialog
        open={confirmKind !== null}
        title={confirmDialogProps?.title ?? ""}
        description={confirmDialogProps?.description ?? ""}
        confirmLabel={confirmDialogProps?.confirmLabel ?? "Confirm"}
        pending={pending}
        onConfirm={handleConfirmDialog}
        onCancel={() => setConfirmKind(null)}
      />
    </div>
  );
}
