"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  deleteVehicleAction,
  deleteVehicleDocumentAction,
  updateVehicleAction,
  uploadVehicleDocumentAction,
} from "@/app/actions/rental-vehicles";
import { loadVehiclePurchaseDateAction } from "@/app/actions/rental-vehicle-financials";
import { VehicleSubcompanyTransferModal } from "@/app/(main)/rental/vehicles/[id]/details/vehicle-subcompany-transfer-modal";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formatUkDate, formatUkDateTextLong, formatUkDateTime, formatUkDateTimeText } from "@/lib/datetime/uk";
import {
  assessVehicleExpiries,
  vehicleExpiryAttentionItems,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import {
  REQUIRED_VEHICLE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  isPhvTaxiLicencePaperDocType,
  vehicleStatusPillClass,
  type RequiredVehicleDocType,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import { vehicleDocumentHistoryLabel } from "@/lib/fleet/vehicle-historic-access";
import {
  openTransferRequirementForVehicleDocType,
  type VehicleTransferOpenRequirement,
} from "@/lib/fleet/vehicle-transfer-document-requirements";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { VehicleExpiryAlert } from "@/app/(main)/rental/vehicles/vehicle-expiry-indicators";
import { InsuranceDocumentIcon } from "@/components/fleet/insurance-document-icon";
import { VehicleDocRowMenu } from "./vehicle-doc-actions";

const btnPrimary = "rph-btn-primary";
const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnGhost = "rph-btn-ghost";
const btnDocGhost =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";
const btnDocPrimary =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-rph-rail px-2.5 text-xs font-semibold text-white hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

const cardMenuTriggerClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";
const cardMenuContentClass =
  "z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";
const cardMenuItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";
const cardMenuDangerItemClass = `${cardMenuItemClass} text-red-700 dark:text-red-300`;

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

type CardMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

function CardActionsMenu({
  label,
  disabled,
  items,
}: {
  label: string;
  disabled?: boolean;
  items: CardMenuItem[];
}) {
  if (!items.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={cardMenuTriggerClass} disabled={disabled} aria-label={label} title={label}>
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={cardMenuContentClass}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={item.danger ? cardMenuDangerItemClass : cardMenuItemClass}
              disabled={item.disabled}
              onSelect={() => item.onSelect()}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
type EditSection = "specs" | "registration" | "doc_expiry" | "notes";

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

function fleetStatusLabel(status: VehicleStatus): string {
  if (status === "on_rent") return "On hire";
  return VEHICLE_STATUS_LABELS[status];
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rph-border py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-rph-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-rph-fg">{value || "—"}</dd>
    </div>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return <p className="company-dash-section-label">{children}</p>;
}

function TransferTimelineIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 16V4M7 4L3 8M7 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8v12M17 20l4-4M17 20l-4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function requiredDocTitle(docType: RequiredVehicleDocType): string {
  if (docType === "mot") return "MOT certificate";
  if (docType === "logbook") return "V5C logbook";
  return "PHV vehicle licence";
}

function docCardMeta(
  vehicle: VehicleRow,
  docType: RequiredVehicleDocType,
  onFile: VehicleDocumentRow | undefined,
  notifySettings: CompanyNotificationSettings,
): { detail: string; badge: string; ok: boolean } {
  if (docType === "mot") {
    const mot = assessVehicleExpiries(vehicle, notifySettings).find((i) => i.kind === "mot");
    if (!onFile) return { detail: "Not uploaded yet", badge: "Missing", ok: false };
    if (mot?.tone === "expired") {
      return {
        detail: mot.message,
        badge: "Expired",
        ok: false,
      };
    }
    return {
      detail: mot?.isoDate
        ? `Expires ${formatUkDateTextLong(mot.isoDate)} · File uploaded`
        : `Uploaded ${formatUkDateTextLong(onFile.created_at.slice(0, 10))}`,
      badge: "Current",
      ok: true,
    };
  }
  if (docType === "logbook") {
    if (!onFile) return { detail: "Not uploaded yet", badge: "Missing", ok: false };
    return {
      detail: `Uploaded ${formatUkDateTextLong(onFile.created_at.slice(0, 10))}`,
      badge: "Complete",
      ok: true,
    };
  }
  const phv = assessVehicleExpiries(vehicle, notifySettings).find((i) => i.kind === "phv");
  if (!onFile) return { detail: "Not uploaded yet", badge: "Missing", ok: false };
  if (phv?.tone === "expired") {
    return { detail: phv.message, badge: "Expired", ok: false };
  }
  return {
    detail: phv?.isoDate
      ? `Expires ${formatUkDateTextLong(phv.isoDate)} · File uploaded`
      : `Uploaded ${formatUkDateTextLong(onFile.created_at.slice(0, 10))}`,
    badge: "Current",
    ok: true,
  };
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

function VehicleDocTypeIcon({ docType }: { docType: string }) {
  if (docType === "insurance") {
    return (
      <span className="shrink-0 text-sky-600 dark:text-sky-400">
        <InsuranceDocumentIcon className="h-5 w-5" />
      </span>
    );
  }
  return <DocFileIcon />;
}

export function VehicleDetailsView({
  initialVehicle,
  initialDocuments,
  initialDocumentHistory,
  initialTransfers,
  transferDocumentRequirements: initialTransferDocumentRequirements,
  subcompanies,
  notifySettings,
  canManage,
  canDelete,
  readOnlyHistoric = false,
  historicTransfer = null,
}: {
  initialVehicle: VehicleRow;
  initialDocuments: VehicleDocumentRow[];
  initialDocumentHistory: VehicleDocumentRow[];
  initialTransfers: VehicleTransferRow[];
  transferDocumentRequirements: VehicleTransferOpenRequirement[];
  subcompanies: SubOpt[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
  readOnlyHistoric?: boolean;
  historicTransfer?: VehicleTransferRow | null;
}) {
  const { refreshShell } = useVehicleWorkspace();
  const [pending, startTransition] = useTransition();
  const [saveOverlay, setSaveOverlay] = useState<ActionStatusOverlayState | null>(null);
  const saving = saveOverlay?.phase === "pending";
  const busy = pending || saving;
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [docs, setDocs] = useState(initialDocuments);
  const [documentHistory, setDocumentHistory] = useState(initialDocumentHistory);
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
    setDocumentHistory(initialDocumentHistory);
    setTransfers(initialTransfers);
    setTransferDocumentRequirements(initialTransferDocumentRequirements);
    if (!editSection) setForm(fromVehicle(initialVehicle));
  }, [
    initialVehicle,
    initialDocuments,
    initialDocumentHistory,
    initialTransfers,
    initialTransferDocumentRequirements,
    editSection,
  ]);

  const missingDocs = vehicle.missing_docs ?? [];
  const fleetTransferRequirements = transferDocumentRequirements.filter((req) => req.vehicleDocType);
  const hireTransferRequirements = transferDocumentRequirements.filter((req) => req.href);
  const expiryAttention = vehicleExpiryAttentionItems(vehicle, notifySettings);
  const expiryTone = worstVehicleExpiryTone(expiryAttention);
  const complianceDocs = (readOnlyHistoric ? documentHistory : docs).filter((d) => d.doc_type !== "photo");
  const otherDocs = complianceDocs.filter(
    (d) =>
      !REQUIRED_VEHICLE_DOC_TYPES.includes(d.doc_type as RequiredVehicleDocType) &&
      !isPhvTaxiLicencePaperDocType(d.doc_type),
  );

  const refresh = useCallback(async () => {
    const ok = await refreshShell();
    if (!ok) setError("Could not refresh vehicle.");
  }, [refreshShell]);

  useEffect(() => {
    let cancelled = false;
    void loadVehiclePurchaseDateAction(vehicle.id).then((res) => {
      if (cancelled) return;
      if (res.ok) setPurchaseDate(res.occurredOn);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id]);

  const isArchived = Boolean(vehicle.archived_at);

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
    <div className="space-y-4 sm:space-y-5">
      {error && !editSection ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {readOnlyHistoric && historicTransfer ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">Historic read-only view</p>
          <p className="mt-1">
            This vehicle was transferred to {historicTransfer.to_name ?? "another company"} on{" "}
            {formatUkDateTime(historicTransfer.transferred_at)}. You can view ended hires and documents from when it
            operated under {historicTransfer.from_name ?? "your company"}.
          </p>
        </div>
      ) : null}

      {!readOnlyHistoric ? <VehicleExpiryAlert items={expiryAttention} tone={expiryTone} /> : null}

      {isArchived ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">Archived vehicle</p>
          <p className="mt-1">
            Hidden from the active fleet list. Hire history and documents are kept. Use{" "}
            <span className="font-medium">Sell vehicle</span> on Financials when the car is sold.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rph-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionKicker>Vehicle record</SectionKicker>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Specifications</h2>
            </div>
            {canManage && !isArchived ? (
              <CardActionsMenu
                label="Specifications actions"
                disabled={busy}
                items={[{ label: "Edit details", onSelect: () => openEdit("specs") }]}
              />
            ) : null}
          </div>
          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <dl>
              <DetailRow label="Registration" value={<span className="font-mono">{vehicle.vrm}</span>} />
              <DetailRow label="Model" value={vehicle.model} />
              <DetailRow label="Fuel type" value={vehicle.fuel_type || "—"} />
              <DetailRow label="Year" value={yearFromDate(vehicle.first_reg_date)} />
              <DetailRow label="PHV/Taxi licence no." value={vehicle.phv_licence_no || "—"} />
            </dl>
            <dl>
              <DetailRow label="Make" value={vehicle.make} />
              <DetailRow label="Colour" value={vehicle.colour || "—"} />
              <DetailRow label="Seats" value={vehicle.seats != null ? String(vehicle.seats) : "—"} />
              <DetailRow
                label="Engine CC"
                value={vehicle.cc != null ? `${vehicle.cc.toLocaleString("en-GB")} cc` : "—"}
              />
              <DetailRow label="Licensing authority" value={vehicle.licensing_authority_name || "—"} />
            </dl>
          </div>
        </section>

        <section className="rph-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionKicker>Registration</SectionKicker>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Ownership</h2>
            </div>
            <CardActionsMenu
              label="Ownership actions"
              disabled={busy}
              items={
                [
                  ...(canManage && !isArchived
                    ? [
                        {
                          label: "Edit registration",
                          onSelect: () => openEdit("registration"),
                        } satisfies CardMenuItem,
                      ]
                    : []),
                  ...(canDelete && !isArchived && !readOnlyHistoric
                    ? [
                        {
                          label: "Archive vehicle",
                          onSelect: () => setDeleteConfirm(true),
                          danger: true,
                        } satisfies CardMenuItem,
                      ]
                    : []),
                ] as CardMenuItem[]
              }
            />
          </div>
          <dl className="mt-4">
            <DetailRow label="Subcompany" value={vehicle.subcompany_name ?? "—"} />
            <DetailRow
              label="Vehicle status"
              value={
                isArchived ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    Archived
                  </span>
                ) : (
                  <span className={vehicleStatusPillClass(vehicle.status)}>{fleetStatusLabel(vehicle.status)}</span>
                )
              }
            />
            <DetailRow label="First registered" value={formatUkDateTextLong(vehicle.first_reg_date)} />
            <DetailRow label="First UK registration" value={formatUkDateTextLong(vehicle.first_reg_uk_date)} />
            <DetailRow
              label="Purchase date"
              value={purchaseDate ? formatUkDateTextLong(purchaseDate) : "—"}
            />
          </dl>
        </section>

        <section className="rph-card flex max-h-[28rem] flex-col overflow-hidden p-0">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
            <div>
              <SectionKicker>Moves</SectionKicker>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Transfer history</h2>
            </div>
            {canManage && !isArchived && !readOnlyHistoric ? (
              <CardActionsMenu
                label="Transfer actions"
                disabled={busy}
                items={[{ label: "Transfer", onSelect: () => setTransferOpen(true) }]}
              />
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {transfers.length ? (
              <ol className="hire-ws-activity-list">
                {[...transfers]
                  .sort((a, b) => Date.parse(b.transferred_at) - Date.parse(a.transferred_at))
                  .map((t) => {
                    const timestampLabel = formatUkDateTimeText(t.transferred_at);
                    return (
                      <li
                        key={t.id}
                        className="hire-ws-activity-row !grid-cols-[2.25rem_minmax(0,1fr)] sm:!grid-cols-[2.25rem_minmax(0,1fr)]"
                      >
                        <div className="hire-ws-activity-rail">
                          <span className="hire-ws-activity-icon hire-ws-activity-icon-inspection" aria-hidden>
                            <TransferTimelineIcon />
                          </span>
                        </div>
                        <div className="hire-ws-activity-body">
                          <p className="mb-1 text-xs text-rph-fg-muted">{timestampLabel}</p>
                          <p className="text-sm font-semibold text-rph-fg">
                            Transferred to {t.to_name ?? "another subcompany"}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-rph-fg-secondary">
                            From {t.from_name ?? "—"} → {t.to_name ?? "—"}
                          </p>
                          {t.notes?.trim() ? (
                            <p className="mt-1.5 text-xs text-rph-fg-muted">{t.notes.trim()}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
              </ol>
            ) : (
              <p className="px-4 py-5 text-sm text-rph-fg-secondary sm:px-5">No subcompany transfers yet.</p>
            )}
          </div>
        </section>
      </div>

      <section id="documents" className="rph-card scroll-mt-6 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionKicker>Compliance</SectionKicker>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">
              {readOnlyHistoric ? "Historic documents" : "Documents & expiry dates"}
            </h2>
            <p className="rph-meta mt-1">
              {readOnlyHistoric
                ? "Superseded fleet documents from your assignment period."
                : "Required: MOT, Logbook (V5C), and PHV/Taxi licence paper."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fleetTransferRequirements.length ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {fleetTransferRequirements.length} update{fleetTransferRequirements.length === 1 ? "" : "s"} required
              </span>
            ) : null}
            {missingDocs.length ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {missingDocs.length} missing
              </span>
            ) : !fleetTransferRequirements.length && !readOnlyHistoric ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Complete
              </span>
            ) : null}
            {canManage && !isArchived && !readOnlyHistoric ? (
              <CardActionsMenu
                label="Documents actions"
                disabled={busy}
                items={[{ label: "Edit document expiry", onSelect: () => openEdit("doc_expiry") }]}
              />
            ) : null}
          </div>
        </div>

        <dl className="mt-4 max-w-md">
          <DetailRow label="First UK registration" value={formatUkDateTextLong(vehicle.first_reg_uk_date)} />
        </dl>

        {transferDocumentRequirements.length ? (
          <div className="rph-alert-warn mt-4 text-sm">
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

        {!readOnlyHistoric ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {REQUIRED_VEHICLE_DOC_TYPES.map((docType) => {
              const onFile = docOnFile(docs, docType);
              const bundle = uploadBundles[docType];
              const ready = bundle.files.length > 0;
              const transferRequirement = openTransferRequirementForVehicleDocType(
                transferDocumentRequirements,
                docType,
              );
              const meta = docCardMeta(vehicle, docType, onFile, notifySettings);
              return (
                <li key={docType} className="rounded-xl border border-rph-border bg-rph-page/40 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                      <DocFileIcon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-rph-fg">{requiredDocTitle(docType)}</p>
                          <p className="mt-0.5 text-xs text-rph-fg-muted">
                            {transferRequirement ? "Upload a replacement after the subcompany transfer." : meta.detail}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`text-xs font-semibold ${
                              transferRequirement || !meta.ok
                                ? "text-amber-800 dark:text-amber-200"
                                : "text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {transferRequirement ? "Update required" : meta.badge}
                          </span>
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
                      </div>
                      {canManage && ready ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <ul className="rph-meta flex-1">
                            {bundle.files.map((f, i) => (
                              <li key={`${f.name}-${i}`}>{f.name}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className={btnDocGhost}
                            disabled={busy}
                            onClick={() => clearUploadBundle(docType)}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className={btnDocPrimary}
                            disabled={busy}
                            onClick={() => requestDocUpload(docType)}
                          >
                            {pending ? "Uploading…" : onFile ? "Replace" : "Upload"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : documentHistory.length ? (
          <ul className="mt-4 space-y-3">
            {documentHistory.map((d) => {
              const transfer = d.vehicle_transfer_id
                ? transfers.find((t) => t.id === d.vehicle_transfer_id)
                : null;
              return (
                <li key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-rph-border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <VehicleDocTypeIcon docType={d.doc_type} />
                      <p className="text-sm font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[d.doc_type]}</p>
                    </div>
                    <p className="rph-meta mt-1 pl-7">
                      {d.file_name ?? "PDF on file"} · uploaded {formatUkDateTime(d.created_at)}
                    </p>
                    <p className="rph-meta pl-7">
                      {vehicleDocumentHistoryLabel({
                        versionStatus: d.version_status,
                        createdAt: d.created_at,
                        transferFromName: transfer?.from_name,
                        transferToName: transfer?.to_name,
                        transferredAt: transfer?.transferred_at,
                      })}
                    </p>
                  </div>
                  <VehicleDocRowMenu doc={d} canManage={false} removeDisabled onError={setError} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-rph-fg-muted">No historic fleet documents on file.</p>
        )}

        {!readOnlyHistoric && documentHistory.length ? (
          <div className="mt-4 border-t border-rph-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Document history</h3>
            <p className="rph-meta mt-1">Previous versions kept after subcompany transfers.</p>
            <ul className="mt-3 space-y-3">
              {documentHistory.map((d) => {
                const transfer = d.vehicle_transfer_id
                  ? transfers.find((t) => t.id === d.vehicle_transfer_id)
                  : null;
                return (
                  <li key={d.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[d.doc_type]}</p>
                      <p className="rph-meta">
                        {d.file_name ?? "PDF"} · {formatUkDateTime(d.created_at)} ·{" "}
                        {vehicleDocumentHistoryLabel({
                          versionStatus: d.version_status,
                          createdAt: d.created_at,
                          transferFromName: transfer?.from_name,
                          transferToName: transfer?.to_name,
                          transferredAt: transfer?.transferred_at,
                        })}
                      </p>
                    </div>
                    <VehicleDocRowMenu doc={d} canManage={false} removeDisabled onError={setError} />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!readOnlyHistoric && otherDocs.length ? (
          <ul className="mt-4 space-y-3 border-t border-rph-border pt-4">
            {otherDocs.map((d) => {
              const transferRequirement = openTransferRequirementForVehicleDocType(
                transferDocumentRequirements,
                d.doc_type,
              );
              return (
                <li key={d.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <VehicleDocTypeIcon docType={d.doc_type} />
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

      {(vehicle.notes || canManage) ? (
        <section className="rph-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionKicker>Internal</SectionKicker>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Vehicle notes</h2>
            </div>
            {canManage && !isArchived ? (
              <CardActionsMenu
                label="Notes actions"
                disabled={busy}
                items={[{ label: "Edit notes", onSelect: () => openEdit("notes") }]}
              />
            ) : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-rph-fg-secondary">
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
              : editSection === "doc_expiry"
                ? "Edit document expiry"
                : "Edit notes"
        }
        description={`${vehicle.vrm} · ${vehicle.make} ${vehicle.model}`}
        showDraftActions={false}
        pending={busy}
        isDirty={JSON.stringify(form) !== JSON.stringify(fromVehicle(vehicle))}
        maxWidthClass={editSection === "notes" || editSection === "registration" ? "max-w-lg" : "max-w-2xl"}
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
                  label: fleetStatusLabel(st),
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
            <Field label="PHV/Taxi licence no.">
              <input
                className="rph-input"
                value={form.phv_licence_no}
                onChange={(e) => setForm((p) => ({ ...p, phv_licence_no: e.target.value }))}
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
          </div>
        ) : null}

        {editSection === "doc_expiry" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="MOT expiry">
              <input
                type="date"
                className="rph-input"
                value={form.mot_expiry}
                onChange={(e) => setForm((p) => ({ ...p, mot_expiry: e.target.value }))}
              />
            </Field>
            <Field label="Tax expiry">
              <input
                type="date"
                className="rph-input"
                value={form.tax_expiry}
                onChange={(e) => setForm((p) => ({ ...p, tax_expiry: e.target.value }))}
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
        title="Archive vehicle?"
        description="This hides the vehicle from the active fleet list. Hire history and documents are kept. End any open hire first. To record a sale, use Sell vehicle on Financials instead."
        confirmLabel={pending ? "Archiving…" : "Archive"}
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
