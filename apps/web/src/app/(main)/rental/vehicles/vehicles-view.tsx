"use client";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteVehicleAction,
  deleteVehicleDocumentAction,
  loadVehicleDetailAction,
  transferVehicleAction,
  updateVehicleAction,
  uploadVehicleDocumentAction,
} from "@/app/actions/rental-vehicles";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";
import {
  VEHICLE_COMPLIANCE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  type VehicleDocumentRow,
  type VehicleDocType,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import { AddVehicleModal } from "./add-vehicle-modal";

const MANAGE_STEPS = ["Details", "Specs", "Photos", "Documents"] as const;

const btnPrimary =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnGhostTall =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnDanger =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

type SubOpt = { id: string; name: string | null; is_primary: boolean };

type FormSnapshot = {
  subcompany_id: string;
  vrm: string;
  make: string;
  model: string;
  colour: string;
  first_reg_date: string;
  first_reg_uk_date: string;
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
  notes: string;
};

function fromVehicle(v: VehicleRow): FormSnapshot {
  return {
    subcompany_id: v.subcompany_id,
    vrm: v.vrm,
    make: v.make,
    model: v.model,
    colour: v.colour ?? "",
    first_reg_date: v.first_reg_date ?? "",
    first_reg_uk_date: v.first_reg_uk_date ?? "",
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
    notes: v.notes ?? "",
  };
}

function snapshotToFormData(s: FormSnapshot): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(s)) {
    if (k === "subcompany_id") continue;
    fd.set(k, v);
  }
  return fd;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function ManageStepProgress({ step }: { step: number }) {
  const displayStep = step + 1;
  return (
    <nav className="mb-2" aria-label="Manage vehicle steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step {displayStep} of {MANAGE_STEPS.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {MANAGE_STEPS.map((label, i) => {
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
                  {done ? "✓" : n}
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
    </nav>
  );
}

export function VehiclesView({
  vehicles,
  subcompanies,
  canManage,
  canDelete,
}: {
  vehicles: VehicleRow[];
  subcompanies: SubOpt[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const canScanOrCapture = useCanScanOrCaptureDocument();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const [editVehicle, setEditVehicle] = useState<VehicleRow | null>(null);
  const [editForm, setEditForm] = useState<FormSnapshot | null>(null);
  const [manageStep, setManageStep] = useState(0);
  const [docs, setDocs] = useState<VehicleDocumentRow[]>([]);
  const [transfers, setTransfers] = useState<VehicleTransferRow[]>([]);
  const [docType, setDocType] = useState<VehicleDocType>("mot");
  const [docExpiry, setDocExpiry] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.subcompany_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [vehicles, filter, statusFilter]);

  const photos = docs.filter((d) => d.doc_type === "photo");
  const complianceDocs = docs.filter((d) => d.doc_type !== "photo");

  const refreshDetail = useCallback(
    async (vehicleId: string) => {
      const res = await loadVehicleDetailAction(vehicleId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditVehicle(res.vehicle);
      setEditForm(fromVehicle(res.vehicle));
      setDocs(res.documents);
      setTransfers(res.transfers);
    },
    [],
  );

  function openEdit(v: VehicleRow) {
    setError(null);
    setManageStep(0);
    setEditVehicle(v);
    setEditForm(fromVehicle(v));
    setDocs([]);
    setTransfers([]);
    startTransition(async () => {
      await refreshDetail(v.id);
    });
  }

  function closeEdit() {
    setEditVehicle(null);
    setEditForm(null);
    setManageStep(0);
  }

  function submitEdit() {
    if (!editVehicle || !editForm) return;
    setError(null);
    startTransition(async () => {
      const res = await updateVehicleAction(editVehicle.id, snapshotToFormData(editForm));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeEdit();
      router.refresh();
    });
  }

  function submitTransfer() {
    if (!editVehicle || !transferTo) return;
    setError(null);
    startTransition(async () => {
      const res = await transferVehicleAction(editVehicle.id, transferTo, transferNotes);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTransferOpen(false);
      setTransferNotes("");
      await refreshDetail(editVehicle.id);
      router.refresh();
    });
  }

  function submitDelete() {
    if (!editVehicle) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteVehicleAction(editVehicle.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDeleteConfirm(false);
      closeEdit();
      router.refresh();
    });
  }

  function submitDoc(fileList: FileList | null, forcedType?: VehicleDocType) {
    if (!editVehicle || !fileList?.[0]) return;
    setError(null);
    const type = forcedType ?? docType;
    const fd = new FormData();
    fd.set("vehicle_id", editVehicle.id);
    fd.set("doc_type", type);
    fd.set("expiry_date", forcedType === "photo" ? "" : docExpiry);
    fd.set("file", fileList[0]);
    startTransition(async () => {
      const res = await uploadVehicleDocumentAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocExpiry("");
      await refreshDetail(editVehicle.id);
    });
  }

  function removeDoc(docId: string) {
    if (!editVehicle) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteVehicleDocumentAction(docId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await refreshDetail(editVehicle.id);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Vehicles</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Manage your fleet by subcompany. Status is manual for now; hire assignments will drive{" "}
            <span className="font-medium">On rent</span> in a later phase.
          </p>
          {!canManage ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              You can view vehicles in your assigned locations. Ask an owner, admin, or operations user to add or edit
              fleet.
            </p>
          ) : null}
        </div>
        {canManage && subcompanies.length > 0 ? (
          <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
            Add vehicle
          </button>
        ) : null}
      </div>

      {error && !editVehicle ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className={`${inputClass()} sm:max-w-xs`}
          placeholder="Search VRM, make, model…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className={`${inputClass()} sm:max-w-[12rem]`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {VEHICLE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {VEHICLE_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </div>

      {!vehicles.length ? (
        <p className="rph-muted text-sm">No vehicles yet.{canManage ? " Add your first fleet vehicle to get started." : ""}</p>
      ) : !filtered.length ? (
        <p className="rph-muted text-sm">No vehicles match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">VRM</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Subcompany</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">MOT</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((v) => (
                <tr key={v.id} className="bg-white dark:bg-slate-950">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">{v.vrm}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {v.make} {v.model}
                    {v.colour ? <span className="text-slate-400"> · {v.colour}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.subcompany_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {VEHICLE_STATUS_LABELS[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.mot_expiry ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className={btnGhost} onClick={() => openEdit(v)} disabled={pending}>
                      {canManage ? "Manage" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <AddVehicleModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          subcompanies={subcompanies}
          onCreated={() => router.refresh()}
        />
      ) : null}

      {editVehicle && editForm ? (
        <FormModalShell
          open
          titleId="edit-vehicle-title"
          title={`${editVehicle.vrm} · ${editVehicle.make} ${editVehicle.model}`}
          description={
            <>
              Branch: <span className="font-medium">{editVehicle.subcompany_name ?? "—"}</span>
            </>
          }
          headerExtra={<ManageStepProgress step={manageStep} />}
          pending={pending}
          maxWidthClass="max-w-3xl"
          isDirty={false}
          hasStoredDraft={false}
          saveNotice={null}
          onSaveProgress={() => {}}
          onRequestClose={closeEdit}
          discardConfirmOpen={false}
          onConfirmDiscard={() => {}}
          onCancelDiscard={() => {}}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {canManage ? (
                  <button
                    type="button"
                    className={btnGhostTall}
                    disabled={pending}
                    onClick={() => {
                      setTransferTo(subcompanies.find((s) => s.id !== editVehicle.subcompany_id)?.id ?? "");
                      setTransferOpen(true);
                    }}
                  >
                    Transfer
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className={btnDanger} disabled={pending} onClick={() => setDeleteConfirm(true)}>
                    Delete
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {manageStep > 0 ? (
                  <button type="button" className={btnGhostTall} disabled={pending} onClick={() => setManageStep((s) => s - 1)}>
                    Back
                  </button>
                ) : (
                  <button type="button" className={btnGhostTall} disabled={pending} onClick={closeEdit}>
                    Close
                  </button>
                )}
                {manageStep < MANAGE_STEPS.length - 1 ? (
                  <button
                    type="button"
                    className={btnContinue}
                    disabled={pending}
                    onClick={() => setManageStep((s) => Math.min(MANAGE_STEPS.length - 1, s + 1))}
                  >
                    Continue
                  </button>
                ) : canManage ? (
                  <button type="button" className={btnContinue} disabled={pending} onClick={submitEdit}>
                    {pending ? "Saving…" : "Save changes"}
                  </button>
                ) : (
                  <button type="button" className={btnContinue} disabled={pending} onClick={closeEdit}>
                    Done
                  </button>
                )}
              </div>
            </div>
          }
        >
          {error ? <p className="mb-4 rph-alert-error text-sm">{error}</p> : null}

          {manageStep === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="VRM *">
                <input
                  className={inputClass()}
                  value={editForm.vrm}
                  disabled={!canManage}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, vrm: e.target.value.toUpperCase() } : p))}
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputClass()}
                  value={editForm.status}
                  disabled={!canManage}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, status: e.target.value as VehicleStatus } : p))}
                >
                  {VEHICLE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {VEHICLE_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Make *">
                <input
                  className={inputClass()}
                  value={editForm.make}
                  disabled={!canManage}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, make: e.target.value } : p))}
                />
              </Field>
              <Field label="Model *">
                <input
                  className={inputClass()}
                  value={editForm.model}
                  disabled={!canManage}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, model: e.target.value } : p))}
                />
              </Field>
              <Field label="Colour">
                <input
                  className={inputClass()}
                  value={editForm.colour}
                  disabled={!canManage}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, colour: e.target.value } : p))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea
                    className={inputClass()}
                    rows={3}
                    value={editForm.notes}
                    disabled={!canManage}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, notes: e.target.value } : p))}
                  />
                </Field>
              </div>
              {transfers.length ? (
                <div className="sm:col-span-2 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transfer history</h3>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {transfers.map((t) => (
                      <li key={t.id}>
                        {t.from_name ?? "—"} → {t.to_name ?? "—"}{" "}
                        <span className="text-xs text-slate-400">· {new Date(t.transferred_at).toLocaleString("en-GB")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {manageStep === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["first_reg_date", "First registration", "date"],
                  ["first_reg_uk_date", "First UK registration", "date"],
                  ["fuel_type", "Fuel type", "text"],
                  ["seats", "Seats", "number"],
                  ["cc", "Engine CC", "number"],
                  ["service_due_at", "Service due", "date"],
                  ["mot_expiry", "MOT expiry", "date"],
                  ["tax_expiry", "Tax expiry", "date"],
                  ["phv_licence_no", "PHV licence no.", "text"],
                  ["phv_licence_expiry", "PHV licence expiry", "date"],
                  ["licensing_authority_name", "Licensing authority", "text"],
                  ["vehicle_age_limit_years", "Age limit (years)", "number"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} label={label}>
                  <input
                    type={type}
                    className={inputClass()}
                    value={editForm[key]}
                    disabled={!canManage}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, [key]: e.target.value } : p))}
                  />
                </Field>
              ))}
            </div>
          ) : null}

          {manageStep === 2 ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Vehicle photos for handover and fleet records.</p>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <label className={btnGhost + " cursor-pointer"}>
                    Choose photos
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={pending}
                      onChange={(e) => {
                        submitDoc(e.target.files, "photo");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {canScanOrCapture ? (
                    <label className={btnContinue + " cursor-pointer"}>
                      Scan or take photo
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        disabled={pending}
                        onChange={(e) => {
                          submitDoc(e.target.files, "photo");
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {!photos.length ? (
                <p className="text-sm text-slate-500">No photos uploaded.</p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {photos.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="truncate text-slate-800 dark:text-slate-200">{d.file_name ?? d.file_path}</span>
                      {canManage ? (
                        <button type="button" className={btnDanger} disabled={pending} onClick={() => removeDoc(d.id)}>
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {manageStep === 3 ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">MOT, insurance, logbook, and related compliance files.</p>
              {canManage ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Document type">
                      <select className={inputClass()} value={docType} onChange={(e) => setDocType(e.target.value as VehicleDocType)}>
                        {VEHICLE_COMPLIANCE_DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {VEHICLE_DOC_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Expiry (optional)">
                      <input type="date" className={inputClass()} value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className={btnGhost + " cursor-pointer"}>
                      Choose file
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        disabled={pending}
                        onChange={(e) => {
                          submitDoc(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {canScanOrCapture ? (
                      <label className={btnContinue + " cursor-pointer"}>
                        Scan or take photo
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          capture="environment"
                          disabled={pending}
                          onChange={(e) => {
                            submitDoc(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                </>
              ) : null}
              {!complianceDocs.length ? (
                <p className="text-sm text-slate-500">No documents uploaded.</p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {complianceDocs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">{VEHICLE_DOC_TYPE_LABELS[d.doc_type]}</p>
                        <p className="text-xs text-slate-500">
                          {d.file_name ?? d.file_path}
                          {d.expiry_date ? ` · expires ${d.expiry_date}` : ""}
                        </p>
                      </div>
                      {canManage ? (
                        <button type="button" className={btnDanger} disabled={pending} onClick={() => removeDoc(d.id)}>
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </FormModalShell>
      ) : null}

      {transferOpen && editVehicle ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[1] w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transfer vehicle</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Move {editVehicle.vrm} to another subcompany. This writes an audit entry.
            </p>
            <Field label="Destination">
              <select className={inputClass()} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                {subcompanies
                  .filter((s) => s.id !== editVehicle.subcompany_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? "Untitled"}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Notes (optional)">
              <input className={inputClass()} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setTransferOpen(false)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} disabled={pending || !transferTo} onClick={submitTransfer}>
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
    </div>
  );
}
