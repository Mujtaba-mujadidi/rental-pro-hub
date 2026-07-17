"use client";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVehicleAction, uploadVehicleDocumentAction } from "@/app/actions/rental-vehicles";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { useCanScanOrCaptureDocument } from "@/hooks/use-can-scan-or-capture-document";
import {
  VEHICLE_COMPLIANCE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  type VehicleDocType,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";

const STEP_LABELS = ["Basics", "Specs", "Photos", "Documents", "Review"] as const;

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function inputClass() {
  return "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
}

function StepProgress({ step }: { step: number }) {
  const displayStep = step + 1;
  return (
    <nav className="mb-2" aria-label="Add vehicle steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step {displayStep} of {STEP_LABELS.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {STEP_LABELS.map((label, i) => {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

type SubOpt = { id: string; name: string | null; is_primary: boolean };

type PendingDoc = {
  id: string;
  fileName: string;
  docType: VehicleDocType;
  expiry: string;
  /** Kept in memory only — not serialized to localStorage drafts. */
  file: File;
};

const DRAFT_KEY = "add-vehicle";

export const ADD_VEHICLE_DRAFT_KEY = DRAFT_KEY;

export type VehicleDraftFields = {
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

type VehicleSnapshot = {
  step: number;
  fields: VehicleDraftFields;
  pendingMeta: { id: string; fileName: string; docType: VehicleDocType; expiry: string }[];
};

function emptyFields(defaultSubId: string): VehicleDraftFields {
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

function fieldsToFormData(fields: VehicleDraftFields): FormData {
  const fd = new FormData();
  fd.set("subcompany_id", fields.subcompany_id);
  for (const [k, v] of Object.entries(fields)) {
    if (k === "subcompany_id") continue;
    fd.set(k, v);
  }
  return fd;
}

export function AddVehicleModal({
  open,
  onOpenChange,
  subcompanies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcompanies: SubOpt[];
  onCreated?: () => void;
}) {
  const router = useRouter();
  const canScanOrCapture = useCanScanOrCaptureDocument();
  const primarySub = subcompanies.find((s) => s.is_primary)?.id ?? subcompanies[0]?.id ?? "";
  const baseline = useMemo<VehicleSnapshot>(
    () => ({ step: 0, fields: emptyFields(primarySub), pendingMeta: [] }),
    [primarySub],
  );

  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<VehicleDraftFields>(() => emptyFields(primarySub));
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [docType, setDocType] = useState<VehicleDocType>("mot");
  const [docExpiry, setDocExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setField = useCallback(<K extends keyof VehicleDraftFields>(key: K, value: VehicleDraftFields[K]) => {
    setFields((p) => ({ ...p, [key]: value }));
  }, []);

  const snapshot = useMemo<VehicleSnapshot>(
    () => ({
      step,
      fields,
      pendingMeta: pendingDocs.map(({ id, fileName, docType, expiry }) => ({ id, fileName, docType, expiry })),
    }),
    [step, fields, pendingDocs],
  );

  const applySnapshot = useCallback(
    (s: VehicleSnapshot) => {
      const mergedFields = { ...emptyFields(primarySub), ...(s.fields ?? {}) };
      setStep(typeof s.step === "number" ? s.step : 0);
      setFields(mergedFields);
      // Browser drafts cannot store File blobs — remind user to re-attach photos/docs.
      setPendingDocs([]);
      setError(
        s.pendingMeta?.length
          ? `Draft restored. Re-attach ${s.pendingMeta.length} photo/document file(s) on the Photos or Documents steps — file contents are not kept in drafts.`
          : null,
      );
    },
    [primarySub],
  );

  const {
    saveNotice,
    hasStoredDraft,
    isDirty,
    saveProgress,
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
    draftKey: DRAFT_KEY,
    open,
    snapshot,
    baseline,
    pending,
    applySnapshot,
    onClose: () => onOpenChange(false),
    onAfterClear: () => {
      setPendingDocs([]);
      setDocExpiry("");
      setDocType("mot");
    },
  });

  function canGoNext() {
    if (step === 0) {
      return Boolean(fields.subcompany_id && fields.vrm.trim().length >= 2 && fields.make.trim() && fields.model.trim());
    }
    return true;
  }

  function addFiles(fileList: FileList | null, forcedType?: VehicleDocType) {
    if (!fileList?.length) return;
    const type = forcedType ?? docType;
    const next: PendingDoc[] = [];
    for (const file of Array.from(fileList)) {
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name || "upload",
        docType: type,
        expiry: forcedType === "photo" ? "" : docExpiry,
        file,
      });
    }
    setPendingDocs((prev) => [...prev, ...next]);
    if (forcedType !== "photo") setDocExpiry("");
  }

  function removePending(id: string) {
    setPendingDocs((prev) => prev.filter((d) => d.id !== id));
  }

  const photos = pendingDocs.filter((d) => d.docType === "photo");
  const complianceDocs = pendingDocs.filter((d) => d.docType !== "photo");

  function submitAll() {
    setError(null);
    startTransition(async () => {
      const created = await createVehicleAction(fieldsToFormData(fields));
      if (!created.ok || !created.id) {
        setError(created.ok ? "Could not create vehicle." : created.error);
        return;
      }

      const uploadErrors: string[] = [];
      for (const doc of pendingDocs) {
        const fd = new FormData();
        fd.set("vehicle_id", created.id);
        fd.set("doc_type", doc.docType);
        fd.set("expiry_date", doc.expiry);
        fd.set("file", doc.file);
        const up = await uploadVehicleDocumentAction(fd);
        if (!up.ok) uploadErrors.push(`${doc.fileName}: ${up.error}`);
      }

      clearAfterSuccess();
      setPendingDocs([]);
      onOpenChange(false);
      onCreated?.();
      router.refresh();

      if (uploadErrors.length) {
        setError(`Vehicle saved, but some uploads failed: ${uploadErrors.join("; ")}`);
      }
    });
  }

  const subName = subcompanies.find((s) => s.id === fields.subcompany_id)?.name ?? "—";

  return (
    <FormModalShell
      open={open}
      titleId="add-vehicle-title"
      title="Add vehicle"
      description="Register a fleet vehicle, then attach photos and compliance documents."
      headerExtra={<StepProgress step={step} />}
      pending={pending}
      maxWidthClass="max-w-3xl"
      saveNotice={saveNotice}
      hasStoredDraft={hasStoredDraft}
      isDirty={isDirty || pendingDocs.length > 0}
      onSaveProgress={saveProgress}
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
          <button type="button" className={btnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={pending} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={btnContinue}
                disabled={pending || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={btnContinue} disabled={pending || !canGoNext()} onClick={submitAll}>
                {pending ? "Saving…" : "Save vehicle"}
              </button>
            )}
          </div>
        </>
      }
    >
      {error ? <p className="mb-4 rph-alert-error text-sm">{error}</p> : null}

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subcompany *">
            <select className={inputClass()} value={fields.subcompany_id} onChange={(e) => setField("subcompany_id", e.target.value)}>
              {subcompanies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? "Untitled"}
                  {s.is_primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="VRM *">
            <input
              className={inputClass()}
              value={fields.vrm}
              onChange={(e) => setField("vrm", e.target.value.toUpperCase())}
              placeholder="AB12CDE"
              autoComplete="off"
            />
          </Field>
          <Field label="Make *">
            <input className={inputClass()} value={fields.make} onChange={(e) => setField("make", e.target.value)} />
          </Field>
          <Field label="Model *">
            <input className={inputClass()} value={fields.model} onChange={(e) => setField("model", e.target.value)} />
          </Field>
          <Field label="Colour">
            <input className={inputClass()} value={fields.colour} onChange={(e) => setField("colour", e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className={inputClass()}
              value={fields.status}
              onChange={(e) => setField("status", e.target.value as VehicleStatus)}
            >
              {VEHICLE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {VEHICLE_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea className={inputClass()} rows={3} value={fields.notes} onChange={(e) => setField("notes", e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First registration">
            <input type="date" className={inputClass()} value={fields.first_reg_date} onChange={(e) => setField("first_reg_date", e.target.value)} />
          </Field>
          <Field label="First UK registration">
            <input
              type="date"
              className={inputClass()}
              value={fields.first_reg_uk_date}
              onChange={(e) => setField("first_reg_uk_date", e.target.value)}
            />
          </Field>
          <Field label="Fuel type">
            <input
              className={inputClass()}
              value={fields.fuel_type}
              onChange={(e) => setField("fuel_type", e.target.value)}
              placeholder="Petrol / Diesel / Hybrid / EV"
            />
          </Field>
          <Field label="Seats">
            <input type="number" min={1} max={99} className={inputClass()} value={fields.seats} onChange={(e) => setField("seats", e.target.value)} />
          </Field>
          <Field label="Engine CC">
            <input type="number" min={0} className={inputClass()} value={fields.cc} onChange={(e) => setField("cc", e.target.value)} />
          </Field>
          <Field label="Service due">
            <input type="date" className={inputClass()} value={fields.service_due_at} onChange={(e) => setField("service_due_at", e.target.value)} />
          </Field>
          <Field label="MOT expiry">
            <input type="date" className={inputClass()} value={fields.mot_expiry} onChange={(e) => setField("mot_expiry", e.target.value)} />
          </Field>
          <Field label="Tax expiry">
            <input type="date" className={inputClass()} value={fields.tax_expiry} onChange={(e) => setField("tax_expiry", e.target.value)} />
          </Field>
          <Field label="PHV licence no.">
            <input className={inputClass()} value={fields.phv_licence_no} onChange={(e) => setField("phv_licence_no", e.target.value)} />
          </Field>
          <Field label="PHV licence expiry">
            <input
              type="date"
              className={inputClass()}
              value={fields.phv_licence_expiry}
              onChange={(e) => setField("phv_licence_expiry", e.target.value)}
            />
          </Field>
          <Field label="Licensing authority">
            <input
              className={inputClass()}
              value={fields.licensing_authority_name}
              onChange={(e) => setField("licensing_authority_name", e.target.value)}
            />
          </Field>
          <Field label="Age limit (years)">
            <input
              type="number"
              min={1}
              className={inputClass()}
              value={fields.vehicle_age_limit_years}
              onChange={(e) => setField("vehicle_age_limit_years", e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Add vehicle photos now (optional). You can skip and continue — photos can also be added later from Manage.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className={btnGhost + " cursor-pointer"}>
              Choose photos
              <input
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={pending}
                onChange={(e) => {
                  addFiles(e.target.files, "photo");
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
                    addFiles(e.target.files, "photo");
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
          {canScanOrCapture ? (
            <p className="text-xs text-slate-500">
              On iPhone, Choose photos → Browse can also offer Scan Documents.
            </p>
          ) : null}
          {!photos.length ? (
            <p className="text-sm text-slate-500">No photos selected yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {photos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-slate-800 dark:text-slate-200">{p.fileName}</span>
                  <button type="button" className={btnGhost} onClick={() => removePending(p.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Attach MOT, insurance, logbook, and other compliance files (optional). Skip if you will add them later.
          </p>
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
                  addFiles(e.target.files);
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
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
          {!complianceDocs.length ? (
            <p className="text-sm text-slate-500">No documents selected yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {complianceDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{VEHICLE_DOC_TYPE_LABELS[d.docType]}</p>
                    <p className="truncate text-xs text-slate-500">
                      {d.fileName}
                      {d.expiry ? ` · expires ${d.expiry}` : ""}
                    </p>
                  </div>
                  <button type="button" className={btnGhost} onClick={() => removePending(d.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {fields.vrm || "—"} · {fields.make} {fields.model}
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {subName} · {VEHICLE_STATUS_LABELS[fields.status]}
              {fields.colour ? ` · ${fields.colour}` : ""}
            </p>
            <dl className="mt-3 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">MOT</dt>
                <dd>{fields.mot_expiry || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tax</dt>
                <dd>{fields.tax_expiry || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">PHV</dt>
                <dd>
                  {fields.phv_licence_no || "—"}
                  {fields.phv_licence_expiry ? ` · exp ${fields.phv_licence_expiry}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Fuel / seats</dt>
                <dd>
                  {fields.fuel_type || "—"}
                  {fields.seats ? ` · ${fields.seats} seats` : ""}
                </dd>
              </div>
            </dl>
          </div>
          <p>
            <span className="font-medium">{photos.length}</span> photo{photos.length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium">{complianceDocs.length}</span> document
            {complianceDocs.length === 1 ? "" : "s"} ready to upload after save.
          </p>
          <p className="text-xs text-slate-500">
            Saving creates the vehicle, then uploads any selected photos and documents.
          </p>
        </div>
      ) : null}
    </FormModalShell>
  );
}
