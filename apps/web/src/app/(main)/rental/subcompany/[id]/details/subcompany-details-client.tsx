"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  getSubcompanyLogoPreviewUrlAction,
  removeSubcompanyLogoAction,
  updateSubcompanyAction,
  uploadSubcompanyLogoAction,
} from "@/app/actions/rental-subcompany-workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import { formatUkDate } from "@/lib/datetime/uk";
import { subcompanyInitials } from "@/lib/rental/subcompanies-portfolio-display";
import type { SubcompanyRow } from "@/lib/rental/subcompany";
import type {
  SubcompanyEditablePatch,
  SubcompanyFieldChange,
} from "@/lib/rental/subcompany-contract-impact";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import { SubcompanyStatusChip } from "../subcompany-status-chip";
import { SubcompanyContractImpactModal } from "../subcompany-contract-impact-modal";
import { useSubcompanyWorkspace } from "../subcompany-workspace-provider";

type EditSection = "company" | "operations";

const SECTION_TITLES: Record<EditSection, string> = {
  company: "Edit legal details",
  operations: "Edit contact & address",
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
  return {
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
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(shell.logoSignedUrl);
  const [removeLogoConfirmOpen, setRemoveLogoConfirmOpen] = useState(false);
  const [logoAction, setLogoAction] = useState<"upload" | "remove" | null>(null);
  const [logoPending, startLogoTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logoPending) return;
    setLogoPreviewUrl(shell.logoSignedUrl);
    if (shell.logoSignedUrl || !shell.logoOnFile) {
      return;
    }
    let cancelled = false;
    void getSubcompanyLogoPreviewUrlAction(subcompany.id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setLogoPreviewUrl(res.url);
        setLogoError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [subcompany.id, shell.logoOnFile, shell.logoSignedUrl, logoPending]);

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
      const localPreview = URL.createObjectURL(file);
      setLogoPreviewUrl(localPreview);
      setLogoError(null);
      setLogoAction("upload");
      const formData = new FormData();
      formData.set("logo", file);
      startLogoTransition(async () => {
        try {
          const res = await uploadSubcompanyLogoAction(subcompany.id, formData);
          if (fileInputRef.current) fileInputRef.current.value = "";
          if (!res.ok) {
            setLogoError(res.error);
            setLogoPreviewUrl(shell.logoSignedUrl);
            return;
          }
          setLogoError(null);
          refreshShell();
          if (res.promptContractImpact) {
            setImpactFields([
              { field: "logo_storage_path", label: "Logo", from: hadLogo ? "(set)" : null, to: "(set)" },
            ]);
          }
        } finally {
          URL.revokeObjectURL(localPreview);
          setLogoAction(null);
        }
      });
    },
    [subcompany.id, subcompany.logo_storage_path, refreshShell, shell.logoSignedUrl],
  );

  const removeLogo = useCallback(() => {
    setLogoPreviewUrl(null);
    setLogoError(null);
    setLogoAction("remove");
    startLogoTransition(async () => {
      try {
        const res = await removeSubcompanyLogoAction(subcompany.id);
        setRemoveLogoConfirmOpen(false);
        if (!res.ok) {
          setLogoError(res.error);
          setLogoPreviewUrl(shell.logoSignedUrl);
          return;
        }
        refreshShell();
        if (res.promptContractImpact) {
          setImpactFields([{ field: "logo_storage_path", label: "Logo", from: "(set)", to: null }]);
        }
      } finally {
        setLogoAction(null);
      }
    });
  }, [subcompany.id, refreshShell, shell.logoSignedUrl]);

  const address = formatSubcompanyAddressLines(subcompany);
  const contactName = [subcompany.primary_contact_first_name, subcompany.primary_contact_last_name]
    .filter(Boolean)
    .join(" ");
  const tradingName = subcompany.display_name?.trim() || subcompany.name;

  return (
    <div className="subco-dt space-y-4 sm:space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rph-card overflow-hidden p-0">
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="company-dash-section-label">Registration</p>
              <h2 className="mt-1 text-base font-semibold text-rph-fg">Legal details</h2>
            </div>
            {canWrite ? (
              <button
                type="button"
                className="rph-btn-ghost h-9 min-w-0 px-3 text-sm"
                onClick={() => openSection("company")}
              >
                Edit
              </button>
            ) : null}
          </div>
          <dl className="divide-y divide-rph-border">
            <DetailRow label="Legal name" value={subcompany.legal_name || subcompany.name} />
            <DetailRow
              label="Company number"
              value={subcompany.company_number}
              hint="Fixed after registration"
            />
            <DetailRow label="Trading name" value={tradingName} />
            <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
              <dt className="shrink-0 text-rph-fg-muted">Trading status</dt>
              <dd className="min-w-0 text-right">
                <SubcompanyStatusChip status={subcompany.status} />
              </dd>
            </div>
            {subcompany.notes?.trim() ? (
              <DetailRow label="Internal notes" value={subcompany.notes} />
            ) : null}
          </dl>
        </section>

        <section className="rph-card overflow-hidden p-0">
          <div className="flex items-start justify-between gap-3 border-b border-rph-border px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="company-dash-section-label">Operations</p>
              <h2 className="mt-1 text-base font-semibold text-rph-fg">Contact & address</h2>
            </div>
            {canWrite ? (
              <button
                type="button"
                className="rph-btn-ghost h-9 min-w-0 px-3 text-sm"
                onClick={() => openSection("operations")}
              >
                Edit
              </button>
            ) : null}
          </div>
          <dl className="divide-y divide-rph-border">
            <DetailRow label="Operations email" value={subcompany.primary_contact_email} />
            <DetailRow label="Telephone" value={subcompany.primary_contact_phone} />
            <DetailRow label="Registered office" value={address} />
            <DetailRow label="Primary contact" value={contactName} />
            <DetailRow
              label="Date of birth"
              value={
                subcompany.primary_contact_dob ? formatUkDate(subcompany.primary_contact_dob) : null
              }
            />
            <DetailRow label="Country" value={subcompany.country} />
          </dl>
        </section>

        <section className="rph-card flex flex-col overflow-hidden p-0">
          <div className="border-b border-rph-border px-4 py-3.5 sm:px-5">
            <p className="company-dash-section-label">Branding</p>
            <h2 className="mt-1 text-base font-semibold text-rph-fg">Logo</h2>
          </div>
          <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
            {logoError ? <p className="rph-alert-error mb-3 text-sm">{logoError}</p> : null}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-rph-border bg-rph-chrome/50 p-3 shadow-sm">
                {logoPending ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-rph-raised/95">
                    <span
                      className="h-6 w-6 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail"
                      aria-hidden
                    />
                    <span className="rph-muted text-xs">
                      {logoAction === "remove" ? "Removing…" : "Uploading…"}
                    </span>
                  </div>
                ) : null}
                {logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreviewUrl}
                    alt={`${subcompany.name} logo`}
                    className={`max-h-full max-w-full object-contain ${logoPending ? "opacity-40" : ""}`}
                  />
                ) : shell.logoOnFile ? (
                  <span className="rph-muted text-xs">Loading…</span>
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-rph-fg-muted">
                    <span className="text-2xl font-semibold tracking-tight text-rph-fg-secondary">
                      {subcompanyInitials(subcompany.name)}
                    </span>
                    <span className="text-[11px]">No logo yet</span>
                  </span>
                )}
              </div>
              <p className="max-w-[16rem] text-xs leading-snug text-rph-fg-muted">
                Used on hire agreements and permission letters. PNG, JPEG or WebP.
              </p>
              {canWrite ? (
                <div className="flex w-full flex-col gap-2 sm:max-w-[14rem]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={logoPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo(file);
                    }}
                  />
                  <button
                    type="button"
                    className="rph-btn-primary h-10 w-full min-w-0 text-sm"
                    disabled={logoPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoPreviewUrl || shell.logoOnFile ? "Change logo" : "Upload logo"}
                  </button>
                  {subcompany.logo_storage_path ? (
                    <button
                      type="button"
                      className="rph-btn-ghost h-10 w-full min-w-0 text-sm"
                      disabled={logoPending}
                      onClick={() => setRemoveLogoConfirmOpen(true)}
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
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
            <FormModalField label="Trading name">
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

        {section === "operations" ? (
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
            <FormModalField label="Email" className="sm:col-span-2">
              <input
                type="email"
                className="rph-input"
                value={draft.primary_contact_email}
                onChange={(e) => patch("primary_contact_email", e.target.value)}
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
            <FormModalField label="Date of birth">
              <input
                type="date"
                className="rph-input"
                value={draft.primary_contact_dob}
                onChange={(e) => patch("primary_contact_dob", e.target.value)}
              />
            </FormModalField>
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

function DetailRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
      <dt className="shrink-0 text-rph-fg-muted">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-rph-fg-muted/80">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 break-words text-right font-semibold text-rph-fg">{value?.trim() || "—"}</dd>
    </div>
  );
}
