"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadPaymentSettingsAction } from "@/app/actions/rental-payment-settings";
import { createVehicleAction, uploadVehicleDocumentAction } from "@/app/actions/rental-vehicles";
import { recordVehiclePurchaseOnCreateAction } from "@/app/actions/rental-vehicle-financials";
import { VehiclePurchaseFormFields } from "@/components/fleet/vehicle-purchase-form-fields";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  emptyPurchaseForm,
  shouldSavePurchase,
  validatePurchaseEventForm,
  type PurchaseEventForm,
} from "@/lib/fleet/vehicle-purchase";
import type { PaymentAccountRow, PaymentMethodRow } from "@/lib/fleet/maintenance";
import {
  REQUIRED_VEHICLE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  type RequiredVehicleDocType,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";
import { VehicleDocAddMenu } from "./vehicle-doc-add-menu";

const STEP_LABELS = ["Basics", "Specs", "Documents", "Purchase", "Review"] as const;

const btnContinue =
  "flex h-11 min-w-[7rem] items-center justify-center rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";
const btnGhost =
  "flex h-11 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";

function StepProgress({ step }: { step: number }) {
  const displayStep = step + 1;
  return (
    <nav className="mb-2" aria-label="Add vehicle steps">
      <p className="rph-meta mb-4 text-center font-medium uppercase tracking-wide">
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
                      segmentBeforeOrange ? "bg-orange-500" : "bg-rph-border",
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
                      "border-orange-500 bg-rph-raised text-orange-600 shadow-md ring-4 ring-orange-100 dark:text-orange-500 dark:ring-orange-950/40",
                    !done &&
                      !active &&
                      "border-rph-border bg-rph-raised text-rph-fg-muted",
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
                    active ? "text-orange-700 dark:text-orange-400" : done ? "text-rph-fg-muted" : "text-rph-fg-muted/70",
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
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}

type SubOpt = { id: string; name: string | null; is_primary: boolean };

type DocBundle = { files: File[] };
type DocBundles = Record<RequiredVehicleDocType, DocBundle>;

function emptyBundles(): DocBundles {
  return {
    mot: { files: [] },
    logbook: { files: [] },
    phv_taxi_licence_paper: { files: [] },
  };
}

type VehicleSnapshot = {
  step: number;
  fields: VehicleDraftFields;
  pendingMeta: { docType: RequiredVehicleDocType; fileCount: number }[];
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
  /** UI-only: copy first_reg_date into first_reg_uk_date (not persisted to DB). */
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
  purchase: PurchaseEventForm;
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
    same_uk_reg_as_first: false,
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
    current_mileage: "",
    next_service_mileage: "",
    notes: "",
    purchase: emptyPurchaseForm([], []),
  };
}

const VEHICLE_ONLY_KEYS: (keyof Omit<VehicleDraftFields, "purchase" | "same_uk_reg_as_first">)[] = [
  "subcompany_id",
  "vrm",
  "make",
  "model",
  "colour",
  "first_reg_date",
  "first_reg_uk_date",
  "fuel_type",
  "seats",
  "cc",
  "mot_expiry",
  "tax_expiry",
  "phv_licence_no",
  "phv_licence_expiry",
  "licensing_authority_name",
  "status",
  "vehicle_age_limit_years",
  "service_due_at",
  "current_mileage",
  "next_service_mileage",
  "notes",
];

function fieldsToFormData(fields: VehicleDraftFields): FormData {
  const fd = new FormData();
  for (const k of VEHICLE_ONLY_KEYS) {
    fd.set(k, String(fields[k]));
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
  const primarySub = subcompanies.find((s) => s.is_primary)?.id ?? subcompanies[0]?.id ?? "";
  const baseline = useMemo<VehicleSnapshot>(
    () => ({ step: 0, fields: emptyFields(primarySub), pendingMeta: [] }),
    [primarySub],
  );

  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<VehicleDraftFields>(() => emptyFields(primarySub));
  const [bundles, setBundles] = useState<DocBundles>(() => emptyBundles());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveOverlay, setSaveOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [pending, startTransition] = useTransition();
  const saving = saveOverlay?.phase === "pending";
  const busy = pending || saving;

  const setField = useCallback(<K extends keyof VehicleDraftFields>(key: K, value: VehicleDraftFields[K]) => {
    setFields((p) => ({ ...p, [key]: value }));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadPaymentSettingsAction().then((res) => {
      if (cancelled || !res.ok) return;
      setPaymentMethods(res.methods);
      setPaymentAccounts(res.accounts);
      setFields((prev) => ({
        ...prev,
        purchase: {
          ...emptyPurchaseForm(res.methods, res.accounts),
          ...prev.purchase,
          payment_method_id: prev.purchase.payment_method_id || res.methods.find((m) => m.is_active)?.id || "",
          payment_account_id: prev.purchase.payment_account_id || res.accounts.find((a) => a.is_active)?.id || "",
        },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const snapshot = useMemo<VehicleSnapshot>(
    () => ({
      step,
      fields,
      pendingMeta: REQUIRED_VEHICLE_DOC_TYPES.filter((t) => bundles[t].files.length > 0).map((docType) => ({
        docType,
        fileCount: bundles[docType].files.length,
      })),
    }),
    [step, fields, bundles],
  );

  const applySnapshot = useCallback(
    (s: VehicleSnapshot) => {
      const mergedFields = { ...emptyFields(primarySub), ...(s.fields ?? {}) };
      const raw = s.fields as VehicleDraftFields & {
        purchase_date?: string;
        purchase_amount_gbp?: string;
        purchase_counterparty?: string;
      };
      if (raw?.purchase && typeof raw.purchase === "object") {
        mergedFields.purchase = { ...emptyPurchaseForm([], []), ...raw.purchase };
      } else if (raw?.purchase_amount_gbp !== undefined || raw?.purchase_date !== undefined) {
        mergedFields.purchase = {
          ...emptyPurchaseForm([], []),
          occurred_on: raw.purchase_date ?? mergedFields.purchase.occurred_on,
          amount_gbp: raw.purchase_amount_gbp ?? "",
          counterparty: raw.purchase_counterparty ?? "",
        };
      }
      const maxStep = STEP_LABELS.length - 1;
      setStep(Math.min(typeof s.step === "number" ? s.step : 0, maxStep));
      setFields(mergedFields);
      setBundles(emptyBundles());
      setError(
        s.pendingMeta?.length
          ? "Draft restored. Re-attach MOT / logbook / PHV/Taxi licence paper on the Documents step — files are not kept in drafts."
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
    saveProgressAndClose,
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
    pending: busy,
    applySnapshot,
    onClose: () => onOpenChange(false),
    onAfterClear: () => {
      setBundles(emptyBundles());
    },
  });

  function canGoNext() {
    if (step === 0) {
      return Boolean(fields.subcompany_id && fields.vrm.trim().length >= 2 && fields.make.trim() && fields.model.trim());
    }
    if (step === 3 && shouldSavePurchase(fields.purchase)) {
      const method = paymentMethods.find((m) => m.id === fields.purchase.payment_method_id) ?? null;
      return validatePurchaseEventForm(fields.purchase, method) === null;
    }
    return true;
  }

  function addFiles(docType: RequiredVehicleDocType, fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setBundles((prev) => ({
      ...prev,
      [docType]: { files: [...prev[docType].files, ...files] },
    }));
  }

  function clearBundle(docType: RequiredVehicleDocType) {
    setBundles((prev) => ({ ...prev, [docType]: { files: [] } }));
  }

  const attachedCount = REQUIRED_VEHICLE_DOC_TYPES.filter((t) => bundles[t].files.length > 0).length;
  const missingOnDraft = REQUIRED_VEHICLE_DOC_TYPES.filter((t) => bundles[t].files.length === 0);

  function submitAll() {
    setError(null);
    if (shouldSavePurchase(fields.purchase)) {
      const method = paymentMethods.find((m) => m.id === fields.purchase.payment_method_id) ?? null;
      const purchaseErr = validatePurchaseEventForm(fields.purchase, method);
      if (purchaseErr) {
        setError(purchaseErr);
        return;
      }
    }
    const willUpload = REQUIRED_VEHICLE_DOC_TYPES.some((t) => bundles[t].files.length > 0);
    setSaveOverlay({
      phase: "pending",
      title: "Saving vehicle…",
      detail: willUpload
        ? "Creating the vehicle and uploading documents. Please wait."
        : "Creating the vehicle record. Please wait.",
    });
    startTransition(async () => {
      const created = await createVehicleAction(fieldsToFormData(fields));
      if (!created.ok || !created.id) {
        const message = created.ok ? "Could not create vehicle." : created.error;
        setError(message);
        setSaveOverlay({ phase: "error", title: "Could not save vehicle", detail: message });
        return;
      }

      const uploadErrors: string[] = [];

      if (shouldSavePurchase(fields.purchase)) {
        const purchaseRes = await recordVehiclePurchaseOnCreateAction(created.id, {
          occurred_on: fields.purchase.occurred_on || new Date().toISOString().slice(0, 10),
          amount_gbp: fields.purchase.amount_gbp,
          counterparty: fields.purchase.counterparty,
          payment_method_id: fields.purchase.payment_method_id || null,
          payment_account_id: fields.purchase.payment_account_id || null,
          payment_reference: fields.purchase.payment_reference,
          notes: fields.purchase.notes,
        });
        if (!purchaseRes.ok) {
          uploadErrors.push(`Purchase: ${purchaseRes.error}`);
        }
      }

      for (const docType of REQUIRED_VEHICLE_DOC_TYPES) {
        const bundle = bundles[docType];
        if (!bundle.files.length) continue;
        const fd = new FormData();
        fd.set("vehicle_id", created.id);
        fd.set("doc_type", docType);
        for (const file of bundle.files) fd.append("files", file);
        const up = await uploadVehicleDocumentAction(fd);
        if (!up.ok) uploadErrors.push(`${VEHICLE_DOC_TYPE_LABELS[docType]}: ${up.error}`);
      }

      clearAfterSuccess();
      setBundles(emptyBundles());
      setSaveOverlay(null);
      onOpenChange(false);
      onCreated?.();
      router.refresh();

      if (uploadErrors.length) {
        setError(`Vehicle saved, but some uploads failed: ${uploadErrors.join("; ")}`);
      }
    });
  }

  const subName = subcompanies.find((s) => s.id === fields.subcompany_id)?.name ?? "—";
  const anyFiles = attachedCount > 0;

  return (
    <>
    <FormModalShell
      open={open}
      titleId="add-vehicle-title"
      title="Add vehicle"
      description="Register a fleet vehicle and optionally attach compliance documents."
      headerExtra={<StepProgress step={step} />}
      pending={busy}
      maxWidthClass="max-w-3xl"
      saveNotice={saveNotice}
      hasStoredDraft={hasStoredDraft}
      isDirty={isDirty || anyFiles}
      onSaveProgress={saveProgress}
      onSaveAndClose={saveProgressAndClose}
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
          <button type="button" className={btnGhost} disabled={busy} onClick={requestClose}>
            Cancel
          </button>
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                className={btnContinue}
                disabled={busy || !canGoNext()}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
              >
                Continue
              </button>
            ) : (
              <button type="button" className={btnContinue} disabled={busy || !canGoNext()} onClick={submitAll}>
                {busy ? "Saving…" : "Save vehicle"}
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
            <select className="rph-input" value={fields.subcompany_id} onChange={(e) => setField("subcompany_id", e.target.value)}>
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
              className="rph-input"
              value={fields.vrm}
              onChange={(e) => setField("vrm", e.target.value.toUpperCase())}
              placeholder="AB12CDE"
              autoComplete="off"
            />
          </Field>
          <Field label="Make *">
            <input className="rph-input" value={fields.make} onChange={(e) => setField("make", e.target.value)} />
          </Field>
          <Field label="Model *">
            <input className="rph-input" value={fields.model} onChange={(e) => setField("model", e.target.value)} />
          </Field>
          <Field label="Colour">
            <input className="rph-input" value={fields.colour} onChange={(e) => setField("colour", e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="rph-input"
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
              <textarea className="rph-input" rows={3} value={fields.notes} onChange={(e) => setField("notes", e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First registration">
            <input
              type="date"
              className="rph-input"
              value={fields.first_reg_date}
              onChange={(e) => {
                const value = e.target.value;
                setFields((p) => ({
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
                value={fields.first_reg_uk_date}
                disabled={fields.same_uk_reg_as_first}
                onChange={(e) => setField("first_reg_uk_date", e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-rph-fg-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-rph-border text-rph-rail focus:ring-rph-rail/30"
                checked={fields.same_uk_reg_as_first}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFields((p) => ({
                    ...p,
                    same_uk_reg_as_first: checked,
                    first_reg_uk_date: checked ? p.first_reg_date : p.first_reg_uk_date,
                  }));
                }}
              />
              Same as first registration
            </label>
          </div>
          <Field label="Fuel type">
            <input
              className="rph-input"
              value={fields.fuel_type}
              onChange={(e) => setField("fuel_type", e.target.value)}
              placeholder="Petrol / Diesel / Hybrid / EV"
            />
          </Field>
          <Field label="Seats">
            <input type="number" min={1} max={99} className="rph-input" value={fields.seats} onChange={(e) => setField("seats", e.target.value)} />
          </Field>
          <Field label="Engine CC">
            <input type="number" min={0} className="rph-input" value={fields.cc} onChange={(e) => setField("cc", e.target.value)} />
          </Field>
          <Field label="MOT expiry">
            <input type="date" className="rph-input" value={fields.mot_expiry} onChange={(e) => setField("mot_expiry", e.target.value)} />
          </Field>
          <Field label="Tax expiry">
            <input type="date" className="rph-input" value={fields.tax_expiry} onChange={(e) => setField("tax_expiry", e.target.value)} />
          </Field>
          <Field label="PHV/Taxi licence no.">
            <input className="rph-input" value={fields.phv_licence_no} onChange={(e) => setField("phv_licence_no", e.target.value)} />
          </Field>
          <Field label="PHV/Taxi licence expiry">
            <input
              type="date"
              className="rph-input"
              value={fields.phv_licence_expiry}
              onChange={(e) => setField("phv_licence_expiry", e.target.value)}
            />
          </Field>
          <Field label="Licensing authority">
            <input
              className="rph-input"
              value={fields.licensing_authority_name}
              onChange={(e) => setField("licensing_authority_name", e.target.value)}
            />
          </Field>
          <Field label="Age limit (years)">
            <input
              type="number"
              min={1}
              className="rph-input"
              value={fields.vehicle_age_limit_years}
              onChange={(e) => setField("vehicle_age_limit_years", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 rounded-lg border border-rph-border bg-rph-chrome p-4">
            <p className="text-sm font-semibold text-rph-fg">Service (optional)</p>
            <p className="rph-meta mt-1">
              Skip these when adding a car if you do not track servicing yet. You can update them later from Manage.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Service due date">
                <input
                  type="date"
                  className="rph-input"
                  value={fields.service_due_at}
                  onChange={(e) => setField("service_due_at", e.target.value)}
                />
              </Field>
              <Field label="Current mileage (miles)">
                <input
                  type="number"
                  min={0}
                  className="rph-input"
                  value={fields.current_mileage}
                  onChange={(e) => setField("current_mileage", e.target.value)}
                  placeholder="e.g. 45200"
                />
              </Field>
              <Field label="Next service mileage">
                <input
                  type="number"
                  min={0}
                  className="rph-input"
                  value={fields.next_service_mileage}
                  onChange={(e) => setField("next_service_mileage", e.target.value)}
                  placeholder="e.g. 50000"
                />
              </Field>
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-rph-fg-muted">
            Required pack: <span className="font-medium">MOT</span>, <span className="font-medium">Logbook (V5C)</span>, and{" "}
            <span className="font-medium">PHV/Taxi licence paper</span>. You can skip and save the vehicle — missing docs stay marked until
            uploaded. For multi-page docs, upload one PDF or several images (we merge and compress into one PDF).
          </p>
          {missingOnDraft.length ? (
            <p className="rph-alert-warn">
              Still missing: {missingOnDraft.map((t) => VEHICLE_DOC_TYPE_LABELS[t]).join(", ")}
            </p>
          ) : (
            <p className="rph-alert-ok">
              All required documents selected for upload.
            </p>
          )}
          {REQUIRED_VEHICLE_DOC_TYPES.map((docType) => {
            const bundle = bundles[docType];
            const ready = bundle.files.length > 0;
            return (
              <div
                key={docType}
                className="rph-card space-y-3 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-rph-fg">{VEHICLE_DOC_TYPE_LABELS[docType]}</p>
                    <p className="rph-meta">
                      {ready
                        ? `${bundle.files.length} file${bundle.files.length === 1 ? "" : "s"} ready`
                        : "Missing — upload PDF or images"}
                    </p>
                  </div>
                  <span
                    className={
                      ready
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                    }
                  >
                    {ready ? "Ready" : "Missing"}
                  </span>
                </div>
                {docType === "logbook" ? (
                  <p className="rph-meta">
                    Licence renewal age is calculated later from first registration and the vehicle age limit on Specs.
                  </p>
                ) : docType === "mot" ? (
                  <p className="rph-meta">MOT expiry is set on Specs — upload the certificate file(s) here.</p>
                ) : (
                  <p className="rph-meta">
                    PHV/Taxi licence expiry is set on Specs — upload the paper file(s) here.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <VehicleDocAddMenu disabled={busy} onFiles={(files) => addFiles(docType, files)} />
                  {ready ? (
                    <button type="button" className={btnGhost} onClick={() => clearBundle(docType)}>
                      Clear
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
              </div>
            );
          })}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-rph-fg-muted">
            Optional — record what your company paid for this vehicle. You can skip and add it later on the vehicle{" "}
            <span className="font-medium">Financials</span> tab.
          </p>
          <VehiclePurchaseFormFields
            form={fields.purchase}
            onChange={(purchase) => setField("purchase", purchase)}
            methods={paymentMethods}
            accounts={paymentAccounts}
          />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 text-sm text-rph-fg-secondary">
          <div className="rounded-lg border border-rph-border bg-rph-chrome p-4">
            <p className="font-semibold text-rph-fg">
              {fields.vrm || "—"} · {fields.make} {fields.model}
            </p>
            <p className="mt-1 text-rph-fg-muted">
              {subName} · {VEHICLE_STATUS_LABELS[fields.status]}
              {fields.colour ? ` · ${fields.colour}` : ""}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-rph-fg">Documents</p>
            <ul className="space-y-1">
              {REQUIRED_VEHICLE_DOC_TYPES.map((t) => (
                <li key={t} className="flex justify-between gap-2">
                  <span>{VEHICLE_DOC_TYPE_LABELS[t]}</span>
                  <span className={bundles[t].files.length ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                    {bundles[t].files.length ? `Upload ${bundles[t].files.length} file(s)` : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-rph-fg">Purchase</p>
            {shouldSavePurchase(fields.purchase) ? (
              <ul className="space-y-1">
                <li className="flex justify-between gap-2">
                  <span>Amount</span>
                  <span className="font-semibold text-rph-fg">{formatGbp(Number.parseFloat(fields.purchase.amount_gbp))}</span>
                </li>
                {fields.purchase.counterparty ? (
                  <li className="flex justify-between gap-2">
                    <span>Seller</span>
                    <span>{fields.purchase.counterparty}</span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="text-amber-700 dark:text-amber-300">Skipped — add on Financials later</p>
            )}
          </div>
          <p className="rph-meta">
            Saving creates the vehicle now. Missing documents stay flagged on the fleet list until you add them from Manage.
          </p>
        </div>
      ) : null}
    </FormModalShell>
    <ActionStatusOverlay state={saveOverlay} onDismiss={() => setSaveOverlay(null)} />
    </>
  );
}
