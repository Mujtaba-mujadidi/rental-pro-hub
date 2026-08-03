"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  removeSubcompanyLogoAction,
  updateSubcompanyAction,
  uploadSubcompanyLogoAction,
} from "@/app/actions/rental-subcompany-workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { formatUkDate } from "@/lib/datetime/uk";
import type { SubcompanyRow } from "@/lib/rental/subcompany";
import type {
  SubcompanyEditablePatch,
  SubcompanyFieldChange,
} from "@/lib/rental/subcompany-contract-impact";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import { SUBCOMPANY_STATUS_LABELS } from "../subcompany-status-chip";
import { SubcompanyContractImpactModal } from "../subcompany-contract-impact-modal";
import { useSubcompanyWorkspace } from "../subcompany-workspace-provider";

type EditSection = "company" | "office" | "contact";

const SECTION_TITLES: Record<EditSection, string> = {
  company: "Edit company",
  office: "Edit registered office",
  contact: "Edit primary contact",
};

const btnPrimary =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";

function draftFrom(sub: SubcompanyRow) {
  return {
    legal_name: sub.legal_name ?? "",
    display_name: sub.display_name ?? "",
    status: sub.status,
    notes: sub.notes ?? "",
    registered_address_line1: sub.registered_address_line1 ?? "",
    registered_address_line2: sub.registered_address_line2 ?? "",
    registered_town: sub.registered_town ?? "",
    registered_county: sub.registered_county ?? "",
    registered_postcode: sub.registered_postcode ?? "",
    country: sub.country ?? "GB",
    primary_contact_first_name: sub.primary_contact_first_name,
    primary_contact_last_name: sub.primary_contact_last_name,
    primary_contact_dob: sub.primary_contact_dob,
    primary_contact_phone: sub.primary_contact_phone,
    primary_contact_email: sub.primary_contact_email,
  };
}

type Draft = ReturnType<typeof draftFrom>;

function patchForSection(section: EditSection, draft: Draft): SubcompanyEditablePatch {
  if (section === "company") {
    return {
      legal_name: draft.legal_name,
      display_name: draft.display_name,
      status: draft.status,
      notes: draft.notes,
    };
  }
  if (section === "office") {
    return {
      registered_address_line1: draft.registered_address_line1,
      registered_address_line2: draft.registered_address_line2,
      registered_town: draft.registered_town,
      registered_county: draft.registered_county,
      registered_postcode: draft.registered_postcode,
      country: draft.country,
    };
  }
  return {
    primary_contact_first_name: draft.primary_contact_first_name,
    primary_contact_last_name: draft.primary_contact_last_name,
    primary_contact_dob: draft.primary_contact_dob,
    primary_contact_phone: draft.primary_contact_phone,
    primary_contact_email: draft.primary_contact_email,
  };
}

export function SubcompanyDetailsClient() {
  const { shell, refreshShell } = useSubcompanyWorkspace();
  const subcompany = shell.subcompany;
  const canWrite = shell.canWrite;

  const [section, setSection] = useState<EditSection | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(subcompany));
  const [formError, setFormError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [logoError, setLogoError] = useState<string | null>(null);
  const [removeLogoConfirmOpen, setRemoveLogoConfirmOpen] = useState(false);
  const [logoPending, startLogoTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [impactFields, setImpactFields] = useState<SubcompanyFieldChange[] | null>(null);

  const openSection = useCallback(
    (next: EditSection) => {
      setDraft(draftFrom(subcompany));
      setFormError(null);
      setSection(next);
    },
    [subcompany],
  );

  const closeSection = useCallback(() => {
    setSection(null);
    setDiscardConfirmOpen(false);
    setFormError(null);
  }, []);

  function patch<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  const save = useCallback(() => {
    if (!section) return;
    startTransition(async () => {
      const res = await updateSubcompanyAction(subcompany.id, patchForSection(section, draft));
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      closeSection();
      refreshShell();
      if (res.promptContractImpact) setImpactFields(res.changedFields);
    });
  }, [section, draft, subcompany.id, closeSection, refreshShell]);

  const uploadLogo = useCallback(
    (file: File) => {
      const hadLogo = Boolean(subcompany.logo_storage_path);
      const formData = new FormData();
      formData.set("logo", file);
      startLogoTransition(async () => {
        const res = await uploadSubcompanyLogoAction(subcompany.id, formData);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!res.ok) {
          setLogoError(res.error);
          return;
        }
        setLogoError(null);
        refreshShell();
        if (res.promptContractImpact) {
          setImpactFields([
            { field: "logo_storage_path", label: "Logo", from: hadLogo ? "(set)" : null, to: "(set)" },
          ]);
        }
      });
    },
    [subcompany.id, subcompany.logo_storage_path, refreshShell],
  );

  const removeLogo = useCallback(() => {
    startLogoTransition(async () => {
      const res = await removeSubcompanyLogoAction(subcompany.id);
      setRemoveLogoConfirmOpen(false);
      if (!res.ok) {
        setLogoError(res.error);
        return;
      }
      setLogoError(null);
      refreshShell();
      if (res.promptContractImpact) {
        setImpactFields([{ field: "logo_storage_path", label: "Logo", from: "(set)", to: null }]);
      }
    });
  }, [subcompany.id, refreshShell]);

  const address = formatSubcompanyAddressLines(subcompany);
  const contactName = [subcompany.primary_contact_first_name, subcompany.primary_contact_last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Details</h1>
        <p className="rph-muted mt-1 text-sm">
          Company name and company number are fixed after registration. Other changes may affect live hire documents.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rph-card p-4">
          <CardHeader
            title="Company"
            onEdit={canWrite ? () => openSection("company") : null}
            editLabel="Edit company"
          />
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Company name" value={subcompany.name} hint="Fixed after registration" />
            <Row label="Company number" value={subcompany.company_number} hint="Fixed after registration" />
            <Row label="Legal name" value={subcompany.legal_name} />
            <Row label="Display name" value={subcompany.display_name} />
            <Row label="Status" value={SUBCOMPANY_STATUS_LABELS[subcompany.status]} />
            <Row label="Internal notes" value={subcompany.notes} />
          </dl>
        </section>

        <section className="rph-card p-4">
          <CardHeader title="Logo" onEdit={null} editLabel="" />
          <p className="rph-muted mt-1 text-sm">Shown on hire agreements and permission letters.</p>
          {logoError ? <p className="rph-alert-error mt-3 text-sm">{logoError}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-rph-border bg-rph-raised p-2">
              {shell.logoSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shell.logoSignedUrl}
                  alt={`${subcompany.name} logo`}
                  className="max-h-20 w-auto object-contain"
                />
              ) : (
                <span className="rph-muted text-xs">No logo</span>
              )}
            </div>
            {canWrite ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="rph-input max-w-xs"
                  disabled={logoPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                  }}
                />
                {subcompany.logo_storage_path ? (
                  <button
                    type="button"
                    className="rph-btn-ghost"
                    disabled={logoPending}
                    onClick={() => setRemoveLogoConfirmOpen(true)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rph-card p-4">
          <CardHeader
            title="Registered office"
            onEdit={canWrite ? () => openSection("office") : null}
            editLabel="Edit registered office"
          />
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Address" value={address} />
            <Row label="Country" value={subcompany.country} />
          </dl>
        </section>

        <section className="rph-card p-4">
          <CardHeader
            title="Primary contact"
            onEdit={canWrite ? () => openSection("contact") : null}
            editLabel="Edit primary contact"
          />
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Name" value={contactName} />
            <Row
              label="Date of birth"
              value={subcompany.primary_contact_dob ? formatUkDate(subcompany.primary_contact_dob) : null}
            />
            <Row label="Phone" value={subcompany.primary_contact_phone} />
            <Row label="Email" value={subcompany.primary_contact_email} />
          </dl>
        </section>
      </div>

      <FormModalShell
        open={section !== null}
        titleId="subcompany-edit-title"
        title={section ? SECTION_TITLES[section] : ""}
        description="Changes here can affect live hire documents."
        maxWidthClass="max-w-2xl"
        pending={pending}
        showDraftActions={false}
        onRequestClose={() => setDiscardConfirmOpen(true)}
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={closeSection}
        onCancelDiscard={() => setDiscardConfirmOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} disabled={pending} onClick={() => setDiscardConfirmOpen(true)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {formError ? <p className="rph-alert-error mb-4 text-sm">{formError}</p> : null}

        {section === "company" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormModalField label="Company name (fixed)" className="sm:col-span-2">
              <input className="rph-input" value={subcompany.name} readOnly disabled />
            </FormModalField>
            <FormModalField label="Company number (fixed)">
              <input className="rph-input" value={subcompany.company_number ?? "—"} readOnly disabled />
            </FormModalField>
            <FormModalField label="Status">
              <FormModalSelect
                value={draft.status}
                onValueChange={(v) => patch("status", v as Draft["status"])}
                aria-label="Status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "pending", label: "Pending" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </FormModalField>
            <FormModalField label="Legal name">
              <input
                className="rph-input"
                value={draft.legal_name}
                onChange={(e) => patch("legal_name", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Display name">
              <input
                className="rph-input"
                value={draft.display_name}
                onChange={(e) => patch("display_name", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Internal notes" className="sm:col-span-2">
              <textarea
                className="rph-input"
                rows={3}
                value={draft.notes}
                onChange={(e) => patch("notes", e.target.value)}
              />
            </FormModalField>
          </div>
        ) : null}

        {section === "office" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormModalField label="Address line 1" className="sm:col-span-2">
              <input
                className="rph-input"
                value={draft.registered_address_line1}
                onChange={(e) => patch("registered_address_line1", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Address line 2" className="sm:col-span-2">
              <input
                className="rph-input"
                value={draft.registered_address_line2}
                onChange={(e) => patch("registered_address_line2", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Town / city">
              <input
                className="rph-input"
                value={draft.registered_town}
                onChange={(e) => patch("registered_town", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="County">
              <input
                className="rph-input"
                value={draft.registered_county}
                onChange={(e) => patch("registered_county", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Postcode">
              <input
                className="rph-input"
                value={draft.registered_postcode}
                onChange={(e) => patch("registered_postcode", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Country">
              <input className="rph-input" value={draft.country} onChange={(e) => patch("country", e.target.value)} />
            </FormModalField>
          </div>
        ) : null}

        {section === "contact" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormModalField label="First name">
              <input
                className="rph-input"
                value={draft.primary_contact_first_name}
                onChange={(e) => patch("primary_contact_first_name", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Last name">
              <input
                className="rph-input"
                value={draft.primary_contact_last_name}
                onChange={(e) => patch("primary_contact_last_name", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Date of birth">
              <input
                type="date"
                className="rph-input"
                value={draft.primary_contact_dob}
                onChange={(e) => patch("primary_contact_dob", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Phone">
              <input
                type="tel"
                className="rph-input"
                value={draft.primary_contact_phone}
                onChange={(e) => patch("primary_contact_phone", e.target.value)}
              />
            </FormModalField>
            <FormModalField label="Email" className="sm:col-span-2">
              <input
                type="email"
                className="rph-input"
                value={draft.primary_contact_email}
                onChange={(e) => patch("primary_contact_email", e.target.value)}
              />
            </FormModalField>
          </div>
        ) : null}
      </FormModalShell>

      <ConfirmDialog
        open={removeLogoConfirmOpen}
        title="Remove logo?"
        description="New hire documents will be generated without a logo. Documents already issued keep the logo they were signed with."
        confirmLabel="Remove logo"
        variant="danger"
        pending={logoPending}
        onConfirm={removeLogo}
        onCancel={() => setRemoveLogoConfirmOpen(false)}
      />

      <SubcompanyContractImpactModal
        open={impactFields !== null}
        subcompanyId={subcompany.id}
        changedFields={impactFields ?? []}
        onDone={() => setImpactFields(null)}
      />
    </div>
  );
}

function CardHeader({
  title,
  onEdit,
  editLabel,
}: {
  title: string;
  onEdit: (() => void) | null;
  editLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="rph-meta font-semibold uppercase tracking-wide">{title}</p>
      {onEdit ? (
        <button type="button" className="rph-btn-toolbar" onClick={onEdit} aria-label={editLabel}>
          Edit
        </button>
      ) : null}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-rph-fg-muted">
        {label}
        {hint ? <span className="rph-meta block text-xs">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 break-words text-right text-rph-fg-secondary">{value || "—"}</dd>
    </div>
  );
}
