"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVehicleAction,
  deleteVehicleAction,
  deleteVehicleDocumentAction,
  loadVehicleDetailAction,
  transferVehicleAction,
  updateVehicleAction,
  uploadVehicleDocumentAction,
} from "@/app/actions/rental-vehicles";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";
import {
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_DOC_TYPES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";

const btnPrimary =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
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

function emptyForm(defaultSubId: string): FormSnapshot {
  return {
    subcompany_id: defaultSubId,
    vrm: "",
    make: "",
    model: "",
    colour: "",
    first_reg_date: "",
    first_reg_uk_date: "",
    fuel_type: "",
    seats: "",
    cc: "",
    mot_expiry: "",
    tax_expiry: "",
    phv_licence_no: "",
    phv_licence_expiry: "",
    licensing_authority_name: "",
    status: "available",
    vehicle_age_limit_years: "",
    service_due_at: "",
    notes: "",
  };
}

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

function snapshotToFormData(s: FormSnapshot, includeSubcompany: boolean): FormData {
  const fd = new FormData();
  if (includeSubcompany) fd.set("subcompany_id", s.subcompany_id);
  fd.set("vrm", s.vrm);
  fd.set("make", s.make);
  fd.set("model", s.model);
  fd.set("colour", s.colour);
  fd.set("first_reg_date", s.first_reg_date);
  fd.set("first_reg_uk_date", s.first_reg_uk_date);
  fd.set("fuel_type", s.fuel_type);
  fd.set("seats", s.seats);
  fd.set("cc", s.cc);
  fd.set("mot_expiry", s.mot_expiry);
  fd.set("tax_expiry", s.tax_expiry);
  fd.set("phv_licence_no", s.phv_licence_no);
  fd.set("phv_licence_expiry", s.phv_licence_expiry);
  fd.set("licensing_authority_name", s.licensing_authority_name);
  fd.set("status", s.status);
  fd.set("vehicle_age_limit_years", s.vehicle_age_limit_years);
  fd.set("service_due_at", s.service_due_at);
  fd.set("notes", s.notes);
  return fd;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function VehicleFields({
  form,
  setForm,
  subcompanies,
  lockSubcompany,
}: {
  form: FormSnapshot;
  setForm: (fn: (prev: FormSnapshot) => FormSnapshot) => void;
  subcompanies: SubOpt[];
  lockSubcompany?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!lockSubcompany ? (
        <Field label="Subcompany *">
          <select
            className={inputClass()}
            value={form.subcompany_id}
            onChange={(e) => setForm((p) => ({ ...p, subcompany_id: e.target.value }))}
          >
            {subcompanies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? "Untitled"}
                {s.is_primary ? " (primary)" : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="VRM *">
        <input
          className={inputClass()}
          value={form.vrm}
          onChange={(e) => setForm((p) => ({ ...p, vrm: e.target.value.toUpperCase() }))}
          placeholder="AB12CDE"
          autoComplete="off"
        />
      </Field>
      <Field label="Make *">
        <input className={inputClass()} value={form.make} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} />
      </Field>
      <Field label="Model *">
        <input className={inputClass()} value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
      </Field>
      <Field label="Colour">
        <input className={inputClass()} value={form.colour} onChange={(e) => setForm((p) => ({ ...p, colour: e.target.value }))} />
      </Field>
      <Field label="Status">
        <select
          className={inputClass()}
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as VehicleStatus }))}
        >
          {VEHICLE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {VEHICLE_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="First registration">
        <input
          type="date"
          className={inputClass()}
          value={form.first_reg_date}
          onChange={(e) => setForm((p) => ({ ...p, first_reg_date: e.target.value }))}
        />
      </Field>
      <Field label="First UK registration">
        <input
          type="date"
          className={inputClass()}
          value={form.first_reg_uk_date}
          onChange={(e) => setForm((p) => ({ ...p, first_reg_uk_date: e.target.value }))}
        />
      </Field>
      <Field label="Fuel type">
        <input
          className={inputClass()}
          value={form.fuel_type}
          onChange={(e) => setForm((p) => ({ ...p, fuel_type: e.target.value }))}
          placeholder="Petrol / Diesel / Hybrid / EV"
        />
      </Field>
      <Field label="Seats">
        <input
          type="number"
          min={1}
          max={99}
          className={inputClass()}
          value={form.seats}
          onChange={(e) => setForm((p) => ({ ...p, seats: e.target.value }))}
        />
      </Field>
      <Field label="Engine CC">
        <input
          type="number"
          min={0}
          className={inputClass()}
          value={form.cc}
          onChange={(e) => setForm((p) => ({ ...p, cc: e.target.value }))}
        />
      </Field>
      <Field label="MOT expiry">
        <input
          type="date"
          className={inputClass()}
          value={form.mot_expiry}
          onChange={(e) => setForm((p) => ({ ...p, mot_expiry: e.target.value }))}
        />
      </Field>
      <Field label="Tax expiry">
        <input
          type="date"
          className={inputClass()}
          value={form.tax_expiry}
          onChange={(e) => setForm((p) => ({ ...p, tax_expiry: e.target.value }))}
        />
      </Field>
      <Field label="PHV licence no.">
        <input
          className={inputClass()}
          value={form.phv_licence_no}
          onChange={(e) => setForm((p) => ({ ...p, phv_licence_no: e.target.value }))}
        />
      </Field>
      <Field label="PHV licence expiry">
        <input
          type="date"
          className={inputClass()}
          value={form.phv_licence_expiry}
          onChange={(e) => setForm((p) => ({ ...p, phv_licence_expiry: e.target.value }))}
        />
      </Field>
      <Field label="Licensing authority">
        <input
          className={inputClass()}
          value={form.licensing_authority_name}
          onChange={(e) => setForm((p) => ({ ...p, licensing_authority_name: e.target.value }))}
        />
      </Field>
      <Field label="Service due">
        <input
          type="date"
          className={inputClass()}
          value={form.service_due_at}
          onChange={(e) => setForm((p) => ({ ...p, service_due_at: e.target.value }))}
        />
      </Field>
      <Field label="Age limit (years)">
        <input
          type="number"
          min={1}
          className={inputClass()}
          value={form.vehicle_age_limit_years}
          onChange={(e) => setForm((p) => ({ ...p, vehicle_age_limit_years: e.target.value }))}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <textarea
            className={inputClass()}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </Field>
      </div>
    </div>
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const canScanOrCapture = useCanScanOrCaptureDocument();

  const primarySub = subcompanies.find((s) => s.is_primary)?.id ?? subcompanies[0]?.id ?? "";
  const baseline = useMemo(() => emptyForm(primarySub), [primarySub]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormSnapshot>(baseline);

  const applySnapshot = useCallback((v: FormSnapshot) => setForm(v), []);
  const draft = useFormModalDraft({
    draftKey: "rental-vehicle-create",
    open: createOpen,
    snapshot: form,
    baseline,
    pending,
    applySnapshot,
    onClose: () => setCreateOpen(false),
  });

  const [editVehicle, setEditVehicle] = useState<VehicleRow | null>(null);
  const [editForm, setEditForm] = useState<FormSnapshot | null>(null);
  const [docs, setDocs] = useState<VehicleDocumentRow[]>([]);
  const [transfers, setTransfers] = useState<VehicleTransferRow[]>([]);
  const [docType, setDocType] = useState<(typeof VEHICLE_DOC_TYPES)[number]>("mot");
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

  function openCreate() {
    setError(null);
    setForm(emptyForm(primarySub));
    setCreateOpen(true);
  }

  function openEdit(v: VehicleRow) {
    setError(null);
    setEditVehicle(v);
    setEditForm(fromVehicle(v));
    setDocs([]);
    setTransfers([]);
    startTransition(async () => {
      const res = await loadVehicleDetailAction(v.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditForm(fromVehicle(res.vehicle));
      setDocs(res.documents);
      setTransfers(res.transfers);
    });
  }

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createVehicleAction(snapshotToFormData(form, true));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      draft.clearAfterSuccess();
      setCreateOpen(false);
      router.refresh();
    });
  }

  function submitEdit() {
    if (!editVehicle || !editForm) return;
    setError(null);
    startTransition(async () => {
      const res = await updateVehicleAction(editVehicle.id, snapshotToFormData(editForm, false));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditVehicle(null);
      setEditForm(null);
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
      const detail = await loadVehicleDetailAction(editVehicle.id);
      if (detail.ok) {
        setEditVehicle(detail.vehicle);
        setEditForm(fromVehicle(detail.vehicle));
        setTransfers(detail.transfers);
      }
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
      setEditVehicle(null);
      setEditForm(null);
      router.refresh();
    });
  }

  function submitDoc(fileList: FileList | null) {
    if (!editVehicle || !fileList?.[0]) return;
    setError(null);
    const fd = new FormData();
    fd.set("vehicle_id", editVehicle.id);
    fd.set("doc_type", docType);
    fd.set("expiry_date", docExpiry);
    fd.set("file", fileList[0]);
    startTransition(async () => {
      const res = await uploadVehicleDocumentAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocExpiry("");
      const detail = await loadVehicleDetailAction(editVehicle.id);
      if (detail.ok) setDocs(detail.documents);
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
      const detail = await loadVehicleDetailAction(editVehicle.id);
      if (detail.ok) setDocs(detail.documents);
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
          <button type="button" className={btnPrimary} onClick={openCreate}>
            Add vehicle
          </button>
        ) : null}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

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

      <FormModalShell
        open={createOpen}
        titleId="add-vehicle-title"
        title="Add vehicle"
        description="Register a fleet vehicle against an operational subcompany."
        pending={pending}
        isDirty={draft.isDirty}
        hasStoredDraft={draft.hasStoredDraft}
        saveNotice={draft.saveNotice}
        onSaveProgress={draft.saveProgress}
        onRequestClose={draft.requestClose}
        onRequestStartFresh={draft.requestStartFresh}
        discardConfirmOpen={draft.discardConfirmOpen}
        onConfirmDiscard={draft.confirmDiscardClose}
        onCancelDiscard={draft.cancelDiscardClose}
        startFreshConfirmOpen={draft.startFreshConfirmOpen}
        onConfirmStartFresh={draft.confirmStartFresh}
        onCancelStartFresh={draft.cancelStartFresh}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={draft.requestClose} disabled={pending}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={submitCreate} disabled={pending || !form.subcompany_id}>
              {pending ? "Saving…" : "Save vehicle"}
            </button>
          </div>
        }
      >
        <VehicleFields form={form} setForm={setForm} subcompanies={subcompanies} />
      </FormModalShell>

      {editVehicle && editForm ? (
        <FormModalShell
          open
          titleId="edit-vehicle-title"
          title={`${editVehicle.vrm} · ${editVehicle.make} ${editVehicle.model}`}
          description={
            <>
              Branch: <span className="font-medium">{editVehicle.subcompany_name ?? "—"}</span>
              {canManage ? ". Use Transfer to move between subcompanies." : null}
            </>
          }
          pending={pending}
          maxWidthClass="max-w-4xl"
          isDirty={false}
          hasStoredDraft={false}
          saveNotice={null}
          onSaveProgress={() => {}}
          onRequestClose={() => {
            setEditVehicle(null);
            setEditForm(null);
          }}
          discardConfirmOpen={false}
          onConfirmDiscard={() => {}}
          onCancelDiscard={() => {}}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {canManage ? (
                  <button
                    type="button"
                    className={btnGhost}
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
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={pending}
                  onClick={() => {
                    setEditVehicle(null);
                    setEditForm(null);
                  }}
                >
                  Close
                </button>
                {canManage ? (
                  <button type="button" className={btnPrimary} disabled={pending} onClick={submitEdit}>
                    {pending ? "Saving…" : "Save changes"}
                  </button>
                ) : null}
              </div>
            </div>
          }
        >
          <div className="space-y-8">
            <VehicleFields
              form={editForm}
              setForm={(fn) => setEditForm((prev) => (prev ? fn(prev) : prev))}
              subcompanies={subcompanies}
              lockSubcompany
            />

            <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documents</h3>
              {canManage ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Type">
                      <select className={inputClass()} value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>
                        {VEHICLE_DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {VEHICLE_DOC_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Expiry (optional)">
                      <input type="date" className={inputClass()} value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
                    </Field>
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
                        <label className={btnPrimary + " cursor-pointer"}>
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
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {canScanOrCapture
                      ? "On supported phones, Scan or take photo opens the camera. On iPhone, Choose file → Browse can also offer Scan Documents."
                      : "PDF or image up to 10 MB. On a phone with a camera, you’ll also see a scan / take photo option."}
                  </p>
                </div>
              ) : null}
              {!docs.length ? (
                <p className="text-sm text-slate-500">No documents uploaded.</p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {docs.map((d) => (
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
            </section>

            <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transfer history</h3>
              {!transfers.length ? (
                <p className="text-sm text-slate-500">No transfers yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  {transfers.map((t) => (
                    <li key={t.id}>
                      {t.from_name ?? "—"} → {t.to_name ?? "—"}{" "}
                      <span className="text-xs text-slate-400">
                        · {new Date(t.transferred_at).toLocaleString("en-GB")}
                      </span>
                      {t.notes ? <span className="block text-xs text-slate-500">{t.notes}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
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
