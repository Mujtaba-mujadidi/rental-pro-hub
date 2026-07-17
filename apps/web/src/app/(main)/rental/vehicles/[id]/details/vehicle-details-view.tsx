"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteVehicleAction,
  deleteVehicleDocumentAction,
  loadVehicleDetailAction,
  transferVehicleAction,
  updateVehicleAction,
  uploadVehicleDocumentAction,
} from "@/app/actions/rental-vehicles";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";
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
import { VehicleDocDownloadButton, VehicleDocViewButton } from "./vehicle-doc-actions";

const btnPrimary = "rph-btn-primary";
const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnGhost = "rph-btn-ghost";
const btnGhostTall =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";
const btnDangerTall =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
const btnDanger =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";

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

function docOnFile(docs: VehicleDocumentRow[], docType: RequiredVehicleDocType): VehicleDocumentRow | undefined {
  if (docType === "phv_taxi_licence_paper") {
    return docs.find((d) => isPhvTaxiLicencePaperDocType(d.doc_type));
  }
  return docs.find((d) => d.doc_type === docType);
}

export function VehicleDetailsView({
  initialVehicle,
  initialDocuments,
  initialTransfers,
  subcompanies,
  canManage,
  canDelete,
}: {
  initialVehicle: VehicleRow;
  initialDocuments: VehicleDocumentRow[];
  initialTransfers: VehicleTransferRow[];
  subcompanies: SubOpt[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const canScanOrCapture = useCanScanOrCaptureDocument();
  const [pending, startTransition] = useTransition();
  const [saveOverlay, setSaveOverlay] = useState<ActionStatusOverlayState | null>(null);
  const saving = saveOverlay?.phase === "pending";
  const busy = pending || saving;
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [docs, setDocs] = useState(initialDocuments);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [form, setForm] = useState(() => fromVehicle(initialVehicle));
  const [uploadBundles, setUploadBundles] = useState<DocUploadBundles>(emptyUploadBundles);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [removeDocConfirm, setRemoveDocConfirm] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    setVehicle(initialVehicle);
    setDocs(initialDocuments);
    setTransfers(initialTransfers);
    setForm(fromVehicle(initialVehicle));
  }, [initialVehicle, initialDocuments, initialTransfers]);

  const missingDocs = vehicle.missing_docs ?? [];
  const complianceDocs = docs.filter((d) => d.doc_type !== "photo");

  const refresh = useCallback(async () => {
    const res = await loadVehicleDetailAction(vehicle.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVehicle(res.vehicle);
    setDocs(res.documents);
    setTransfers(res.transfers);
    setForm(fromVehicle(res.vehicle));
  }, [vehicle.id]);

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
      await refresh();
      router.refresh();
    });
  }

  function submitTransfer() {
    if (!transferTo) return;
    setError(null);
    startTransition(async () => {
      const res = await transferVehicleAction(vehicle.id, transferTo, transferNotes);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTransferOpen(false);
      setTransferNotes("");
      await refresh();
      router.refresh();
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

  function submitDocBundle(docType: RequiredVehicleDocType) {
    const bundle = uploadBundles[docType];
    if (!bundle.files.length) return;
    setError(null);
    const fd = new FormData();
    fd.set("vehicle_id", vehicle.id);
    fd.set("doc_type", docType);
    for (const file of bundle.files) fd.append("files", file);
    startTransition(async () => {
      const res = await uploadVehicleDocumentAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      clearUploadBundle(docType);
      await refresh();
      router.refresh();
    });
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
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Details</h1>
          <p className="rph-muted mt-1 text-sm">Update vehicle data and compliance documents.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <button
              type="button"
              className={btnGhostTall}
              disabled={busy}
              onClick={() => {
                setTransferTo(subcompanies.find((s) => s.id !== vehicle.subcompany_id)?.id ?? "");
                setTransferOpen(true);
              }}
            >
              Transfer
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className={btnDangerTall} disabled={busy} onClick={() => setDeleteConfirm(true)}>
              Delete
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className={btnContinue} disabled={busy} onClick={submitSave}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="space-y-4">
        <h2 className="rph-meta font-semibold uppercase tracking-wide">Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="VRM *">
            <input
              className="rph-input"
              value={form.vrm}
              disabled={!canManage}
              onChange={(e) => setForm((p) => ({ ...p, vrm: e.target.value.toUpperCase() }))}
            />
          </Field>
          <Field label="Status">
            <select
              className="rph-input"
              value={form.status}
              disabled={!canManage}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as VehicleStatus }))}
            >
              {VEHICLE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {VEHICLE_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Make *">
            <input className="rph-input" value={form.make} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} />
          </Field>
          <Field label="Model *">
            <input className="rph-input" value={form.model} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
          </Field>
          <Field label="Colour">
            <input className="rph-input" value={form.colour} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, colour: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea className="rph-input" rows={3} value={form.notes} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="rph-meta font-semibold uppercase tracking-wide">Specs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First registration">
            <input
              type="date"
              className="rph-input"
              value={form.first_reg_date}
              disabled={!canManage}
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
                disabled={!canManage || form.same_uk_reg_as_first}
                onChange={(e) => setForm((p) => ({ ...p, first_reg_uk_date: e.target.value }))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-rph-fg-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-rph-border text-rph-rail focus:ring-rph-rail/30"
                checked={form.same_uk_reg_as_first}
                disabled={!canManage}
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
          {(
            [
              ["fuel_type", "Fuel type", "text"],
              ["seats", "Seats", "number"],
              ["cc", "Engine CC", "number"],
              ["mot_expiry", "MOT expiry", "date"],
              ["tax_expiry", "Tax expiry", "date"],
              ["phv_licence_no", "PHV/Taxi licence no.", "text"],
              ["phv_licence_expiry", "PHV/Taxi licence expiry", "date"],
              ["licensing_authority_name", "Licensing authority", "text"],
              ["vehicle_age_limit_years", "Age limit (years)", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <Field key={key} label={label}>
              <input
                type={type}
                className="rph-input"
                value={form[key]}
                disabled={!canManage}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <div className="sm:col-span-2 rounded-lg border border-rph-border bg-rph-chrome p-4">
            <p className="text-sm font-semibold text-rph-fg">Service (optional)</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Service due date">
                <input type="date" className="rph-input" value={form.service_due_at} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, service_due_at: e.target.value }))} />
              </Field>
              <Field label="Current mileage (miles)">
                <input type="number" min={0} className="rph-input" value={form.current_mileage} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, current_mileage: e.target.value }))} />
              </Field>
              <Field label="Next service mileage">
                <input type="number" min={0} className="rph-input" value={form.next_service_mileage} disabled={!canManage} onChange={(e) => setForm((p) => ({ ...p, next_service_mileage: e.target.value }))} />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section id="documents" className="space-y-4 scroll-mt-6">
        <h2 className="rph-meta font-semibold uppercase tracking-wide">Documents</h2>
        <p className="text-sm text-rph-fg-muted">
          Required pack: <span className="font-medium">MOT</span>, <span className="font-medium">Logbook (V5C)</span>, and{" "}
          <span className="font-medium">PHV/Taxi licence paper</span>. Upload one multi-page PDF or several images.
        </p>
        {missingDocs.length ? (
          <p className="rph-alert-warn">
            Missing: {missingDocs.map((t) => VEHICLE_DOC_TYPE_LABELS[t]).join(", ")}
          </p>
        ) : (
          <p className="rph-alert-ok">
            All required documents on file.
          </p>
        )}
        {REQUIRED_VEHICLE_DOC_TYPES.map((docType) => {
          const onFile = docOnFile(docs, docType);
          const bundle = uploadBundles[docType];
          const ready = bundle.files.length > 0;
          return (
            <div key={docType} className="rph-card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[docType]}</p>
                  <p className="rph-meta">{onFile ? (onFile.file_name ?? "PDF on file") : "Missing — upload PDF or images"}</p>
                </div>
                <span
                  className={
                    onFile
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                  }
                >
                  {onFile ? "On file" : "Missing"}
                </span>
              </div>
              {onFile ? (
                <div className="flex flex-wrap gap-2">
                  <VehicleDocViewButton doc={onFile} onError={setError} />
                  <VehicleDocDownloadButton doc={onFile} onError={setError} />
                </div>
              ) : null}
              {canManage ? (
                <>
                  <p className="rph-meta">
                    {docType === "logbook"
                      ? "Licence renewal age is calculated later from first registration and age limit."
                      : docType === "mot"
                        ? "MOT expiry is set in Specs above — upload the certificate file(s) here."
                        : "PHV/Taxi licence expiry is set in Specs above — upload the paper file(s) here."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className={btnGhost + " cursor-pointer"}>
                      Add PDF / images
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          addUploadFiles(docType, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {canScanOrCapture ? (
                      <label className={btnContinue + " cursor-pointer"}>
                        Scan with camera
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          capture="environment"
                          disabled={busy}
                          onChange={(e) => {
                            addUploadFiles(docType, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                    {ready ? (
                      <>
                        <button type="button" className={btnGhost} disabled={busy} onClick={() => clearUploadBundle(docType)}>
                          Clear
                        </button>
                        <button type="button" className={btnContinue} disabled={busy} onClick={() => submitDocBundle(docType)}>
                          {pending ? "Uploading…" : onFile ? "Replace" : "Upload"}
                        </button>
                      </>
                    ) : null}
                    {onFile ? (
                      <button
                        type="button"
                        className={btnDanger}
                        disabled={busy}
                        onClick={() =>
                          setRemoveDocConfirm({
                            id: onFile.id,
                            label: VEHICLE_DOC_TYPE_LABELS[docType],
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {ready ? (
                    <ul className="rph-meta">
                      {bundle.files.map((f, i) => (
                        <li key={`${f.name}-${i}`}>{f.name}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        {complianceDocs.some(
          (d) =>
            !REQUIRED_VEHICLE_DOC_TYPES.includes(d.doc_type as RequiredVehicleDocType) &&
            !isPhvTaxiLicencePaperDocType(d.doc_type),
        ) ? (
          <div className="space-y-2 border-t border-rph-border pt-4">
            <p className="text-sm font-medium text-rph-fg">Other files</p>
            <ul className="divide-y divide-rph-border rounded-lg border border-rph-border">
              {complianceDocs
                .filter(
                  (d) =>
                    !REQUIRED_VEHICLE_DOC_TYPES.includes(d.doc_type as RequiredVehicleDocType) &&
                    !isPhvTaxiLicencePaperDocType(d.doc_type),
                )
                .map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[d.doc_type]}</p>
                      <p className="rph-meta">{d.file_name ?? d.file_path}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <VehicleDocViewButton doc={d} onError={setError} />
                      <VehicleDocDownloadButton doc={d} onError={setError} />
                      {canManage ? (
                        <button
                          type="button"
                          className={btnDanger}
                          disabled={busy}
                          onClick={() =>
                            setRemoveDocConfirm({
                              id: d.id,
                              label: VEHICLE_DOC_TYPE_LABELS[d.doc_type],
                            })
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>

      {transfers.length ? (
        <section className="space-y-2">
          <h2 className="rph-meta font-semibold uppercase tracking-wide">Transfer history</h2>
          <ul className="space-y-1 text-sm text-rph-fg-secondary">
            {transfers.map((t) => (
              <li key={t.id}>
                {t.from_name ?? "—"} → {t.to_name ?? "—"}{" "}
                <span className="rph-meta">· {new Date(t.transferred_at).toLocaleString("en-GB")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {transferOpen ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[1] w-full max-w-md space-y-4 rounded-2xl border border-rph-border bg-rph-elevated p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-rph-fg">Transfer vehicle</h2>
            <p className="text-sm text-rph-fg-secondary">
              Move {vehicle.vrm} to another subcompany. This writes an audit entry.
            </p>
            <Field label="Destination">
              <select className="rph-input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                {subcompanies
                  .filter((s) => s.id !== vehicle.subcompany_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? "Untitled"}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Notes (optional)">
              <input className="rph-input" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setTransferOpen(false)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} disabled={busy || !transferTo} onClick={submitTransfer}>
                {pending ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
      <ActionStatusOverlay state={saveOverlay} onDismiss={() => setSaveOverlay(null)} />
    </div>
  );
}
