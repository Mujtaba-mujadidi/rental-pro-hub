"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  deleteVehicleAction,
  deleteVehicleDocumentAction,
  updateVehicleAction,
  uploadVehicleDocumentAction,
} from "@/app/actions/rental-vehicles";
import { VehicleSubcompanyTransferModal } from "@/app/(main)/rental/vehicles/[id]/details/vehicle-subcompany-transfer-modal";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import {
  vehicleExpiryAttentionItems,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import {
  REQUIRED_VEHICLE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  isPhvTaxiLicencePaperDocType,
  type RequiredVehicleDocType,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import {
  openTransferRequirementForVehicleDocType,
  type VehicleTransferOpenRequirement,
} from "@/lib/fleet/vehicle-transfer-document-requirements";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { VehicleExpiryAlert } from "@/app/(main)/rental/vehicles/vehicle-expiry-indicators";
import { VehicleDocRowMenu } from "./vehicle-doc-actions";

const btnPrimary = "rph-btn-primary";
const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnGhost = "rph-btn-ghost";
const btnGhostTall =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";
const btnDangerTall =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
const btnCardEdit =
  "inline-flex h-7 shrink-0 items-center rounded-md border border-rph-border bg-rph-raised px-2 text-xs font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";
const btnDocGhost =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";
const btnDocPrimary =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-rph-rail px-2.5 text-xs font-semibold text-white hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

type EditSection = "specs" | "registration" | "notes";

type SubOpt = { id: string; name: string | null; is_primary: boolean };

type FormSnapshot = {
  vrm: string;
  make: string;
  model: string;
  colour: string;
  first_reg_date: string;
  first_reg_uk_date: string;
  same_uk_reg_as_first: boolean;
  fuel_type: string;
  seats: string;
  cc: string;
  mot_expiry: string;
  tax_expiry: string;
  phv_licence_no: string;
  phv_licence_expiry: string;
  licensing_authority_name: string;
  status: VehicleStatus;
  vehicle_age_limit_years: string;
  service_due_at: string;
  current_mileage: string;
  next_service_mileage: string;
  notes: string;
};

type DocUploadBundle = { files: File[] };
type DocUploadBundles = Record<RequiredVehicleDocType, DocUploadBundle>;
type ExpiryDocType = "mot" | "phv_taxi_licence_paper";
type DocUploadExpiryConfirm = { docType: ExpiryDocType; expiry: string };

function emptyUploadBundles(): DocUploadBundles {
  return { mot: { files: [] }, logbook: { files: [] }, phv_taxi_licence_paper: { files: [] } };
}

function fromVehicle(v: VehicleRow): FormSnapshot {
  const first = v.first_reg_date ?? "";
  const uk = v.first_reg_uk_date ?? "";
  return {
    vrm: v.vrm,
    make: v.make,
    model: v.model,
    colour: v.colour ?? "",
    first_reg_date: first,
    first_reg_uk_date: uk,
    same_uk_reg_as_first: Boolean(first && uk && first === uk),
    fuel_type: v.fuel_type ?? "",
    seats: v.seats != null ? String(v.seats) : "",
    cc: v.cc != null ? String(v.cc) : "",
    mot_expiry: v.mot_expiry ?? "",
    tax_expiry: v.tax_expiry ?? "",
    phv_licence_no: v.phv_licence_no ?? "",
    phv_licence_expiry: v.phv_licence_expiry ?? "",
    licensing_authority_name: v.licensing_authority_name ?? "",
    status: v.status,
    vehicle_age_limit_years: v.vehicle_age_limit_years != null ? String(v.vehicle_age_limit_years) : "",
    service_due_at: v.service_due_at ?? "",
    current_mileage: v.current_mileage != null ? String(v.current_mileage) : "",
    next_service_mileage: v.next_service_mileage != null ? String(v.next_service_mileage) : "",
    notes: v.notes ?? "",
  };
}

function snapshotToFormData(s: FormSnapshot): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(s)) {
    if (k === "same_uk_reg_as_first") continue;
    fd.set(k, String(v));
  }
  return fd;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function SpecCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-rph-fg">{value || "—"}</p>
    </div>
  );
}

function RegRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="border-b border-rph-border py-2.5 last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-rph-fg">{value || "—"}</p>
      {hint ? <p className="mt-0.5 text-xs text-rph-fg-muted">{hint}</p> : null}
    </div>
  );
}

function statusBadgeClass(status: VehicleStatus): string {
  if (status === "available") {
    return "bg-emerald-600 text-white";
  }
  if (status === "on_rent" || status === "reserved") {
    return "bg-sky-600 text-white";
  }
  if (status === "repair" || status === "accident_claim") {
    return "bg-amber-600 text-white";
  }
  return "bg-rph-chrome text-rph-fg-secondary";
}

function docOnFile(docs: VehicleDocumentRow[], docType: RequiredVehicleDocType): VehicleDocumentRow | undefined {
  if (docType === "phv_taxi_licence_paper") {
    return docs.find((d) => isPhvTaxiLicencePaperDocType(d.doc_type));
  }
  return docs.find((d) => d.doc_type === docType);
}

function isExpiryDocType(docType: RequiredVehicleDocType): docType is ExpiryDocType {
  return docType === "mot" || docType === "phv_taxi_licence_paper";
}

function defaultExpiryForDocType(vehicle: VehicleRow, docType: ExpiryDocType): string {
  return docType === "mot" ? vehicle.mot_expiry ?? "" : vehicle.phv_licence_expiry ?? "";
}

function miles(n: number | null | undefined): string {
  return n != null ? `${n.toLocaleString("en-GB")} miles` : "—";
}

function yearFromDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})/.exec(iso.trim());
  return m?.[1] ?? "—";
}

function DocFileIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function VehicleDetailsView({
  initialVehicle,
  initialDocuments,
  initialTransfers,
  transferDocumentRequirements: initialTransferDocumentRequirements,
  subcompanies,
  notifySettings,
  canManage,
  canDelete,
}: {
  initialVehicle: VehicleRow;
  initialDocuments: VehicleDocumentRow[];
  initialTransfers: VehicleTransferRow[];
  transferDocumentRequirements: VehicleTransferOpenRequirement[];
  subcompanies: SubOpt[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
}) {
  const { refreshShell } = useVehicleWorkspace();
  const [pending, startTransition] = useTransition();
  const [saveOverlay, setSaveOverlay] = useState<ActionStatusOverlayState | null>(null);
  const saving = saveOverlay?.phase === "pending";
  const busy = pending || saving;
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [docs, setDocs] = useState(initialDocuments);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [transferDocumentRequirements, setTransferDocumentRequirements] = useState(
    initialTransferDocumentRequirements,
  );
  const [form, setForm] = useState(() => fromVehicle(initialVehicle));
  const [editSection, setEditSection] = useState<EditSection | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [uploadBundles, setUploadBundles] = useState<DocUploadBundles>(emptyUploadBundles);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [removeDocConfirm, setRemoveDocConfirm] = useState<{ id: string; label: string } | null>(null);
  const [docUploadExpiryConfirm, setDocUploadExpiryConfirm] = useState<DocUploadExpiryConfirm | null>(null);

  useEffect(() => {
    setVehicle(initialVehicle);
    setDocs(initialDocuments);
    setTransfers(initialTransfers);
    setTransferDocumentRequirements(initialTransferDocumentRequirements);
    if (!editSection) setForm(fromVehicle(initialVehicle));
  }, [initialVehicle, initialDocuments, initialTransfers, initialTransferDocumentRequirements, editSection]);

  const missingDocs = vehicle.missing_docs ?? [];
  const fleetTransferRequirements = transferDocumentRequirements.filter((req) => req.vehicleDocType);
  const hireTransferRequirements = transferDocumentRequirements.filter((req) => req.href);
  const expiryAttention = vehicleExpiryAttentionItems(vehicle, notifySettings);
  const expiryTone = worstVehicleExpiryTone(expiryAttention);
  const complianceDocs = docs.filter((d) => d.doc_type !== "photo");
  const otherDocs = complianceDocs.filter(
    (d) =>
      !REQUIRED_VEHICLE_DOC_TYPES.includes(d.doc_type as RequiredVehicleDocType) &&
      !isPhvTaxiLicencePaperDocType(d.doc_type),
  );

  const refresh = useCallback(async () => {
    const ok = await refreshShell();
    if (!ok) setError("Could not refresh vehicle.");
  }, [refreshShell]);

  function openEdit(section: EditSection) {
    setForm(fromVehicle(vehicle));
    setError(null);
    setEditSection(section);
  }

  function requestCloseEdit() {
    const dirty = JSON.stringify(form) !== JSON.stringify(fromVehicle(vehicle));
    if (dirty) setDiscardConfirm(true);
    else setEditSection(null);
  }

  function submitSave() {
    setError(null);
    setSaveOverlay({
      phase: "pending",
      title: "Saving vehicle…",
      detail: "Updating vehicle details. Please wait.",
    });
    startTransition(async () => {
      const res = await updateVehicleAction(vehicle.id, snapshotToFormData(form));
      if (!res.ok) {
        setError(res.error);
        setSaveOverlay({ phase: "error", title: "Could not save vehicle", detail: res.error });
        return;
      }
      setSaveOverlay(null);
      setEditSection(null);
      await refresh();
    });
  }

  function submitDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteVehicleAction(vehicle.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = "/rental/vehicles";
    });
  }

  function addUploadFiles(docType: RequiredVehicleDocType, fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setUploadBundles((prev) => ({
      ...prev,
      [docType]: { files: [...prev[docType].files, ...files] },
    }));
  }

  function clearUploadBundle(docType: RequiredVehicleDocType) {
    setUploadBundles((prev) => ({ ...prev, [docType]: { files: [] } }));
  }

  function requestDocUpload(docType: RequiredVehicleDocType) {
    const bundle = uploadBundles[docType];
    if (!bundle.files.length) return;
    if (isExpiryDocType(docType)) {
      setError(null);
      setDocUploadExpiryConfirm({ docType, expiry: defaultExpiryForDocType(vehicle, docType) });
      return;
    }
    submitDocBundle(docType);
  }

  function submitDocBundle(docType: RequiredVehicleDocType, expiryYmd?: string) {
    const bundle = uploadBundles[docType];
    if (!bundle.files.length) return;
    if (isExpiryDocType(docType) && !expiryYmd?.trim()) {
      setError(docType === "mot" ? "Enter the MOT expiry date." : "Enter the PHV/Taxi licence expiry date.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("vehicle_id", vehicle.id);
    fd.set("doc_type", docType);
    if (docType === "mot" && expiryYmd) fd.set("mot_expiry", expiryYmd);
    if (docType === "phv_taxi_licence_paper" && expiryYmd) fd.set("phv_licence_expiry", expiryYmd);
    for (const file of bundle.files) fd.append("files", file);
    const transferRequirement = openTransferRequirementForVehicleDocType(transferDocumentRequirements, docType);
    if (transferRequirement?.vehicleTransferId) {
      fd.set("vehicle_transfer_id", transferRequirement.vehicleTransferId);
    }
    if (transferRequirement?.id) {
      fd.set("transfer_requirement_id", transferRequirement.id);
    }
    startTransition(async () => {
      const res = await uploadVehicleDocumentAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      clearUploadBundle(docType);
      setDocUploadExpiryConfirm(null);
      await refresh();
    });
  }

  function confirmDocUploadWithExpiry() {
    if (!docUploadExpiryConfirm) return;
    if (!docUploadExpiryConfirm.expiry.trim()) {
      setError(
        docUploadExpiryConfirm.docType === "mot"
          ? "Enter the MOT expiry date."
          : "Enter the PHV/Taxi licence expiry date.",
      );
      return;
    }
    submitDocBundle(docUploadExpiryConfirm.docType, docUploadExpiryConfirm.expiry);
  }

  function removeDoc(docId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteVehicleDocumentAction(docId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRemoveDocConfirm(null);
      await refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Hero header — matches compact fleet detail mock */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold uppercase tracking-tight text-rph-fg sm:text-3xl">
              {vehicle.make} {vehicle.model}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(vehicle.status)}`}
            >
              {VEHICLE_STATUS_LABELS[vehicle.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-rph-fg-muted">
            {yearFromDate(vehicle.first_reg_date)}
            {" · "}
            {(vehicle.colour || "—").toUpperCase()}
            {" · "}
            VRM: <span className="font-mono font-semibold text-rph-fg">{vehicle.vrm}</span>
            {vehicle.subcompany_name ? (
              <>
                {" · "}
                {vehicle.subcompany_name}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <button
              type="button"
              className={btnGhostTall}
              disabled={busy}
              onClick={() => setTransferOpen(true)}
            >
              Transfer
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className={btnDangerTall} disabled={busy} onClick={() => setDeleteConfirm(true)}>
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {error && !editSection ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <VehicleExpiryAlert items={expiryAttention} tone={expiryTone} />

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="rph-card flex flex-col p-4 sm:p-5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Specifications</h2>
            {canManage ? (
              <button type="button" className={btnCardEdit} disabled={busy} onClick={() => openEdit("specs")}>
                Edit
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <SpecCell label="Make" value={vehicle.make.toUpperCase()} />
            <SpecCell label="Model" value={vehicle.model.toUpperCase()} />
            <SpecCell label="Year" value={yearFromDate(vehicle.first_reg_date)} />
            <SpecCell label="Colour" value={(vehicle.colour || "—").toUpperCase()} />
            <SpecCell label="Fuel type" value={(vehicle.fuel_type || "—").toUpperCase()} />
            <SpecCell label="Seats" value={vehicle.seats != null ? String(vehicle.seats) : "—"} />
            <SpecCell
              label="Engine CC"
              value={vehicle.cc != null ? `${vehicle.cc.toLocaleString("en-GB")}cc` : "—"}
            />
            <SpecCell
              label="Age limit"
              value={
                vehicle.vehicle_age_limit_years != null ? `${vehicle.vehicle_age_limit_years} years` : "—"
              }
            />
          </div>
          <div className="mt-auto border-t border-rph-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Mileage</p>
            <p className="mt-1 text-xl font-bold text-rph-fg">{miles(vehicle.current_mileage)}</p>
            {vehicle.next_service_mileage != null ? (
              <p className="mt-0.5 text-xs text-rph-fg-muted">
                Next service at {vehicle.next_service_mileage.toLocaleString("en-GB")} miles
              </p>
            ) : null}
          </div>
        </section>

        <section className="rph-card p-4 sm:p-5 xl:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Registration</h2>
            {canManage ? (
              <button type="button" className={btnCardEdit} disabled={busy} onClick={() => openEdit("registration")}>
                Edit
              </button>
            ) : null}
          </div>
          <div className="mt-2">
            <RegRow label="First registration" value={formatUkDate(vehicle.first_reg_date)} />
            <RegRow label="UK registration" value={formatUkDate(vehicle.first_reg_uk_date)} />
            <RegRow label="Tax expiry" value={formatUkDate(vehicle.tax_expiry)} />
            <RegRow label="MOT expiry" value={formatUkDate(vehicle.mot_expiry)} />
            <RegRow label="Service due" value={formatUkDate(vehicle.service_due_at)} />
            <RegRow
              label="PHV licence"
              value={vehicle.phv_licence_no || "—"}
              hint={
                <>
                  Expires {formatUkDate(vehicle.phv_licence_expiry)}
                  {vehicle.licensing_authority_name ? ` · ${vehicle.licensing_authority_name}` : ""}
                </>
              }
            />
          </div>
        </section>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <section className="rph-card p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Ownership history</h2>
            {!transfers.length ? (
              <p className="mt-3 text-sm text-rph-fg-muted">No transfers recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {transfers.slice(0, 4).map((t) => (
                  <li key={t.id} className="text-sm">
                    <p className="font-medium text-rph-fg">
                      {t.from_name ?? "—"} → {t.to_name ?? "—"}
                    </p>
                    <p className="rph-meta">{formatUkDateTime(t.transferred_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="documents" className="rph-card scroll-mt-6 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Documents</h2>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {fleetTransferRequirements.length ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {fleetTransferRequirements.length} update{fleetTransferRequirements.length === 1 ? "" : "s"} required
                  </span>
                ) : null}
                {missingDocs.length ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {missingDocs.length} missing
                  </span>
                ) : !fleetTransferRequirements.length ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    Complete
                  </span>
                ) : null}
              </div>
            </div>
            <p className="rph-meta mt-1">Required: MOT, Logbook (V5C), and PHV/Taxi licence paper.</p>
            {transferDocumentRequirements.length ? (
              <div className="rph-alert-warn mt-3 text-sm">
                <p className="font-semibold">
                  {transferDocumentRequirements.length === 1
                    ? "1 document needs updating after the recent subcompany transfer."
                    : `${transferDocumentRequirements.length} documents need updating after the recent subcompany transfer.`}
                </p>
                <p className="mt-1">
                  Upload replacements below for fleet documents. Previous files are kept as superseded versions.
                </p>
                {hireTransferRequirements.length ? (
                  <ul className="mt-2 space-y-1">
                    {hireTransferRequirements.map((req) => (
                      <li key={req.id}>
                        <Link href={req.href!} className="rph-link">
                          {req.label}
                        </Link>
                        <span className="text-rph-fg-secondary"> · update on the hire workspace</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <ul className="mt-3 divide-y divide-rph-border">
              {REQUIRED_VEHICLE_DOC_TYPES.map((docType) => {
                const onFile = docOnFile(docs, docType);
                const bundle = uploadBundles[docType];
                const ready = bundle.files.length > 0;
                const transferRequirement = openTransferRequirementForVehicleDocType(
                  transferDocumentRequirements,
                  docType,
                );
                return (
                  <li key={docType} className="py-3 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <DocFileIcon />
                          <p className="text-sm font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[docType]}</p>
                          {transferRequirement ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                              Update required
                            </span>
                          ) : !onFile ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                              Missing
                            </span>
                          ) : null}
                        </div>
                        <p className="rph-meta mt-1 pl-7">
                          {transferRequirement
                            ? "Upload a replacement after the subcompany transfer."
                            : onFile
                              ? (onFile.file_name ?? "PDF on file")
                              : "Not uploaded yet"}
                        </p>
                      </div>
                      <VehicleDocRowMenu
                        doc={onFile}
                        canManage={canManage}
                        removeDisabled={busy}
                        onRemove={
                          onFile
                            ? () =>
                                setRemoveDocConfirm({
                                  id: onFile.id,
                                  label: VEHICLE_DOC_TYPE_LABELS[docType],
                                })
                            : undefined
                        }
                        onFiles={canManage ? (files) => addUploadFiles(docType, files) : undefined}
                        onError={setError}
                      />
                    </div>
                    {canManage && ready ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        <ul className="rph-meta flex-1">
                          {bundle.files.map((f, i) => (
                            <li key={`${f.name}-${i}`}>{f.name}</li>
                          ))}
                        </ul>
                        <button type="button" className={btnDocGhost} disabled={busy} onClick={() => clearUploadBundle(docType)}>
                          Clear
                        </button>
                        <button type="button" className={btnDocPrimary} disabled={busy} onClick={() => requestDocUpload(docType)}>
                          {pending ? "Uploading…" : onFile ? "Replace" : "Upload"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {otherDocs.length ? (
              <ul className="mt-2 space-y-3 border-t border-rph-border pt-3">
                {otherDocs.map((d) => {
                  const transferRequirement = openTransferRequirementForVehicleDocType(
                    transferDocumentRequirements,
                    d.doc_type,
                  );
                  return (
                  <li key={d.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <DocFileIcon />
                        <p className="text-sm font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[d.doc_type]}</p>
                        {transferRequirement ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            Update required
                          </span>
                        ) : null}
                      </div>
                      <p className="rph-meta mt-1 pl-7">
                        {transferRequirement
                          ? "Upload a replacement after the subcompany transfer."
                          : (d.file_name ?? d.file_path)}
                      </p>
                    </div>
                    <VehicleDocRowMenu
                      doc={d}
                      canManage={canManage}
                      removeDisabled={busy}
                      onRemove={() =>
                        setRemoveDocConfirm({
                          id: d.id,
                          label: VEHICLE_DOC_TYPE_LABELS[d.doc_type],
                        })
                      }
                      onError={setError}
                    />
                  </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        </div>
      </div>

      {(vehicle.notes || canManage) ? (
        <section className="rph-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Notes</h2>
            {canManage ? (
              <button type="button" className={btnCardEdit} disabled={busy} onClick={() => openEdit("notes")}>
                Edit
              </button>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-rph-fg-secondary">
            {vehicle.notes?.trim() ? vehicle.notes : "No notes yet."}
          </p>
        </section>
      ) : null}

      {/* Section edit modal */}
      <FormModalShell
        open={Boolean(editSection)}
        titleId="edit-vehicle-section-title"
        title={
          editSection === "specs"
            ? "Edit specifications"
            : editSection === "registration"
              ? "Edit registration"
              : "Edit notes"
        }
        description={`${vehicle.vrm} · ${vehicle.make} ${vehicle.model}`}
        showDraftActions={false}
        pending={busy}
        isDirty={JSON.stringify(form) !== JSON.stringify(fromVehicle(vehicle))}
        maxWidthClass={editSection === "notes" ? "max-w-lg" : "max-w-2xl"}
        onRequestClose={requestCloseEdit}
        discardConfirmOpen={discardConfirm}
        onConfirmDiscard={() => {
          setDiscardConfirm(false);
          setForm(fromVehicle(vehicle));
          setEditSection(null);
        }}
        onCancelDiscard={() => setDiscardConfirm(false)}
        footer={
          <div className="rph-btn-modal-footer">
            <button type="button" className={btnContinue} disabled={busy} onClick={submitSave}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        }
      >
        {error ? <p className="rph-alert-error mb-4 text-sm">{error}</p> : null}

        {editSection === "specs" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="VRM *">
              <input
                className="rph-input"
                value={form.vrm}
                onChange={(e) => setForm((p) => ({ ...p, vrm: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Status">
              <FormModalSelect
                value={form.status}
                aria-label="Status"
                options={VEHICLE_STATUSES.map((st) => ({
                  value: st,
                  label: VEHICLE_STATUS_LABELS[st],
                }))}
                onValueChange={(value) => setForm((p) => ({ ...p, status: value as VehicleStatus }))}
              />
            </Field>
            <Field label="Make *">
              <input className="rph-input" value={form.make} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} />
            </Field>
            <Field label="Model *">
              <input className="rph-input" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
            </Field>
            <Field label="Colour">
              <input className="rph-input" value={form.colour} onChange={(e) => setForm((p) => ({ ...p, colour: e.target.value }))} />
            </Field>
            <Field label="Fuel type">
              <input
                className="rph-input"
                value={form.fuel_type}
                onChange={(e) => setForm((p) => ({ ...p, fuel_type: e.target.value }))}
              />
            </Field>
            <Field label="Seats">
              <input
                type="number"
                className="rph-input"
                value={form.seats}
                onChange={(e) => setForm((p) => ({ ...p, seats: e.target.value }))}
              />
            </Field>
            <Field label="Engine CC">
              <input
                type="number"
                className="rph-input"
                value={form.cc}
                onChange={(e) => setForm((p) => ({ ...p, cc: e.target.value }))}
              />
            </Field>
            <Field label="Age limit (years)">
              <input
                type="number"
                className="rph-input"
                value={form.vehicle_age_limit_years}
                onChange={(e) => setForm((p) => ({ ...p, vehicle_age_limit_years: e.target.value }))}
              />
            </Field>
            <Field label="Current mileage">
              <input
                type="number"
                min={0}
                className="rph-input"
                value={form.current_mileage}
                onChange={(e) => setForm((p) => ({ ...p, current_mileage: e.target.value }))}
              />
            </Field>
            <Field label="Next service mileage">
              <input
                type="number"
                min={0}
                className="rph-input"
                value={form.next_service_mileage}
                onChange={(e) => setForm((p) => ({ ...p, next_service_mileage: e.target.value }))}
              />
            </Field>
          </div>
        ) : null}

        {editSection === "registration" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First registration">
              <input
                type="date"
                className="rph-input"
                value={form.first_reg_date}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((p) => ({
                    ...p,
                    first_reg_date: value,
                    first_reg_uk_date: p.same_uk_reg_as_first ? value : p.first_reg_uk_date,
                  }));
                }}
              />
            </Field>
            <div className="space-y-2">
              <Field label="First UK registration">
                <input
                  type="date"
                  className="rph-input"
                  value={form.first_reg_uk_date}
                  disabled={form.same_uk_reg_as_first}
                  onChange={(e) => setForm((p) => ({ ...p, first_reg_uk_date: e.target.value }))}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-rph-fg-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-rph-border text-rph-rail focus:ring-rph-rail/30"
                  checked={form.same_uk_reg_as_first}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((p) => ({
                      ...p,
                      same_uk_reg_as_first: checked,
                      first_reg_uk_date: checked ? p.first_reg_date : p.first_reg_uk_date,
                    }));
                  }}
                />
                Same as first registration
              </label>
            </div>
            <Field label="Tax expiry">
              <input
                type="date"
                className="rph-input"
                value={form.tax_expiry}
                onChange={(e) => setForm((p) => ({ ...p, tax_expiry: e.target.value }))}
              />
            </Field>
            <Field label="MOT expiry">
              <input
                type="date"
                className="rph-input"
                value={form.mot_expiry}
                onChange={(e) => setForm((p) => ({ ...p, mot_expiry: e.target.value }))}
              />
            </Field>
            <Field label="Service due date">
              <input
                type="date"
                className="rph-input"
                value={form.service_due_at}
                onChange={(e) => setForm((p) => ({ ...p, service_due_at: e.target.value }))}
              />
            </Field>
            <Field label="PHV/Taxi licence no.">
              <input
                className="rph-input"
                value={form.phv_licence_no}
                onChange={(e) => setForm((p) => ({ ...p, phv_licence_no: e.target.value }))}
              />
            </Field>
            <Field label="PHV/Taxi licence expiry">
              <input
                type="date"
                className="rph-input"
                value={form.phv_licence_expiry}
                onChange={(e) => setForm((p) => ({ ...p, phv_licence_expiry: e.target.value }))}
              />
            </Field>
            <Field label="Licensing authority">
              <input
                className="rph-input"
                value={form.licensing_authority_name}
                onChange={(e) => setForm((p) => ({ ...p, licensing_authority_name: e.target.value }))}
              />
            </Field>
          </div>
        ) : null}

        {editSection === "notes" ? (
          <Field label="Notes">
            <textarea
              className="rph-input"
              rows={6}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
        ) : null}
      </FormModalShell>

      <VehicleSubcompanyTransferModal
        open={transferOpen}
        vehicleId={vehicle.id}
        vehicleVrm={vehicle.vrm}
        fromSubcompanyId={vehicle.subcompany_id}
        subcompanies={subcompanies}
        onDone={async () => {
          setTransferOpen(false);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete vehicle?"
        description="This permanently removes the vehicle and its documents from the fleet list."
        confirmLabel={pending ? "Deleting…" : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        pending={pending}
        onConfirm={submitDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
      <ConfirmDialog
        open={Boolean(removeDocConfirm)}
        title="Remove document?"
        description={
          removeDocConfirm
            ? `This permanently deletes the ${removeDocConfirm.label} file for ${vehicle.vrm}. You can upload a replacement afterwards.`
            : ""
        }
        confirmLabel={pending ? "Removing…" : "Remove"}
        cancelLabel="Cancel"
        variant="danger"
        pending={pending}
        onConfirm={() => {
          if (removeDocConfirm) removeDoc(removeDocConfirm.id);
        }}
        onCancel={() => setRemoveDocConfirm(null)}
      />

      <FormModalShell
        open={Boolean(docUploadExpiryConfirm)}
        titleId="vehicle-doc-expiry-title"
        title={
          docUploadExpiryConfirm?.docType === "mot"
            ? "MOT expiry date"
            : "PHV/Taxi licence expiry date"
        }
        description={`${vehicle.vrm} · confirm the expiry on the new document before uploading.`}
        showDraftActions={false}
        pending={busy}
        isDirty={false}
        maxWidthClass="max-w-md"
        onRequestClose={() => {
          setError(null);
          setDocUploadExpiryConfirm(null);
        }}
        discardConfirmOpen={false}
        onConfirmDiscard={() => {}}
        onCancelDiscard={() => {}}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <button
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() => {
                setError(null);
                setDocUploadExpiryConfirm(null);
              }}
            >
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={confirmDocUploadWithExpiry}>
              {pending ? "Uploading…" : "Upload and save"}
            </button>
          </div>
        }
      >
        {docUploadExpiryConfirm ? (
          <div className="space-y-3">
            {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
            <Field
              label={
                docUploadExpiryConfirm.docType === "mot" ? "MOT expiry date *" : "PHV/Taxi licence expiry date *"
              }
            >
              <input
                type="date"
                className="rph-input"
                value={docUploadExpiryConfirm.expiry}
                onChange={(e) =>
                  setDocUploadExpiryConfirm((prev) => (prev ? { ...prev, expiry: e.target.value } : prev))
                }
              />
            </Field>
            {defaultExpiryForDocType(vehicle, docUploadExpiryConfirm.docType) ? (
              <p className="rph-meta">
                Current expiry on record:{" "}
                {formatUkDate(defaultExpiryForDocType(vehicle, docUploadExpiryConfirm.docType))}. Update this if the
                new document shows a different date.
              </p>
            ) : (
              <p className="rph-meta">No expiry is saved yet — enter the date shown on the document.</p>
            )}
          </div>
        ) : null}
      </FormModalShell>

      <ActionStatusOverlay state={saveOverlay} onDismiss={() => setSaveOverlay(null)} />
    </div>
  );
}
