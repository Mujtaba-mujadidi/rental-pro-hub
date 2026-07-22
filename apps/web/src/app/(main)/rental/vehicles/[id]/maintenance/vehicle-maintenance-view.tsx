"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  deleteMaintenanceRecordAction,
  getMaintenanceExcelTemplateAction,
  importMaintenanceCsvAction,
  previewMaintenanceImportAction,
  saveMaintenanceRecordAction,
  type CsvImportPreviewRow,
  type MaintenanceStaffOption,
  type VehicleMaintenancePageData,
} from "@/app/actions/rental-maintenance";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formatUkDate } from "@/lib/datetime/uk";
import {
  expiryOneYearFromDate,
  formatGbp,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  paymentMethodRequiresAccount,
  type MaintenanceCategory,
  type MaintenanceRecordRow,
  type PaymentAccountRow,
  type PaymentMethodRow,
} from "@/lib/fleet/maintenance";

type FormState = {
  id?: string;
  occurred_on: string;
  category: MaintenanceCategory;
  description: string;
  amount_gbp: string;
  odometer_miles: string;
  paid_to: string;
  paid_by_user_id: string;
  paid_by_label: string;
  payment_method_id: string;
  payment_account_id: string;
  payment_reference: string;
  mot_date: string;
  mot_expiry: string;
  tax_expiry: string;
  phv_start_date: string;
  phv_licence_expiry: string;
  service_due_at: string;
  next_service_mileage: string;
};

type DocConfirmState = {
  kind: "mot" | "phv_taxi_licence";
  expiry: string;
};

function emptyForm(
  methods: PaymentMethodRow[],
  accounts: PaymentAccountRow[],
  vehicle?: VehicleMaintenancePageData["vehicle"],
): FormState {
  const activeMethods = methods.filter((m) => m.is_active);
  const activeAccounts = accounts.filter((a) => a.is_active);
  return {
    occurred_on: new Date().toISOString().slice(0, 10),
    category: "service",
    description: "",
    amount_gbp: "",
    odometer_miles: "",
    paid_to: "",
    paid_by_user_id: "",
    paid_by_label: "",
    payment_method_id: activeMethods[0]?.id ?? "",
    payment_account_id: activeAccounts[0]?.id ?? "",
    payment_reference: "",
    mot_date: "",
    mot_expiry: "",
    tax_expiry: "",
    phv_start_date: "",
    phv_licence_expiry: "",
    service_due_at: vehicle?.service_due_at?.slice(0, 10) ?? "",
    next_service_mileage: vehicle?.next_service_mileage != null ? String(vehicle.next_service_mileage) : "",
  };
}

function fromRecord(
  r: MaintenanceRecordRow,
  methods: PaymentMethodRow[],
  accounts: PaymentAccountRow[],
  vehicle?: VehicleMaintenancePageData["vehicle"],
): FormState {
  const base = emptyForm(methods, accounts, vehicle);
  return {
    ...base,
    id: r.id,
    occurred_on: r.occurred_on?.slice(0, 10) ?? base.occurred_on,
    category: r.category,
    description: r.description ?? "",
    amount_gbp: String(r.amount_gbp),
    odometer_miles: r.odometer_miles != null ? String(r.odometer_miles) : "",
    paid_to: r.paid_to ?? "",
    paid_by_user_id: r.paid_by_user_id ?? "",
    paid_by_label: r.paid_by_label ?? "",
    payment_method_id: r.payment_method_id,
    payment_account_id: r.payment_account_id ?? "",
    payment_reference: r.payment_reference ?? "",
    mot_date: r.category === "mot" ? r.occurred_on?.slice(0, 10) ?? "" : "",
    mot_expiry:
      r.category === "mot"
        ? vehicle?.mot_expiry?.slice(0, 10) ??
          expiryOneYearFromDate(r.occurred_on?.slice(0, 10) ?? "") ??
          ""
        : "",
    tax_expiry: "",
    phv_start_date: r.category === "phv_taxi_licence" ? r.occurred_on?.slice(0, 10) ?? "" : "",
    phv_licence_expiry:
      r.category === "phv_taxi_licence"
        ? vehicle?.phv_licence_expiry?.slice(0, 10) ??
          expiryOneYearFromDate(r.occurred_on?.slice(0, 10) ?? "") ??
          ""
        : "",
  };
}

export function VehicleMaintenanceView({
  initial,
  onDataChange,
}: {
  initial: VehicleMaintenancePageData;
  onDataChange?: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState(initial.records);
  const [totalAmount, setTotalAmount] = useState(initial.totalAmount);
  const [yearTotalAmount, setYearTotalAmount] = useState(initial.yearTotalAmount);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(initial.methods, initial.accounts, initial.vehicle));
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [csvDiscardConfirm, setCsvDiscardConfirm] = useState(false);
  const [baselineForm, setBaselineForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecordRow | null>(null);
  const [deleteMode, setDeleteMode] = useState<"keep" | "correct">("keep");
  const [deleteDates, setDeleteDates] = useState({
    mot_expiry: "",
    tax_expiry: "",
    phv_licence_expiry: "",
    service_due_at: "",
    next_service_mileage: "",
  });
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CsvImportPreviewRow[] | null>(null);
  const [csvStats, setCsvStats] = useState<{ validCount: number; invalidCount: number } | null>(null);
  const [docConfirm, setDocConfirm] = useState<DocConfirmState | null>(null);
  const [docConfirmChecked, setDocConfirmChecked] = useState(false);

  const activeMethods = useMemo(() => initial.methods.filter((m) => m.is_active), [initial.methods]);
  const activeAccounts = useMemo(() => initial.accounts.filter((a) => a.is_active), [initial.accounts]);
  const selectedMethod = useMemo(
    () => activeMethods.find((m) => m.id === form.payment_method_id) ?? null,
    [activeMethods, form.payment_method_id],
  );
  const needsAccount = paymentMethodRequiresAccount(selectedMethod);
  const previewMotExpiry =
    form.category === "mot"
      ? form.mot_expiry ||
        expiryOneYearFromDate((form.mot_date || form.occurred_on).slice(0, 10)) ||
        null
      : null;
  const previewPhvExpiry =
    form.category === "phv_taxi_licence"
      ? form.phv_licence_expiry ||
        expiryOneYearFromDate((form.phv_start_date || form.occurred_on).slice(0, 10)) ||
        null
      : null;
  const taxReady = form.category !== "tax" || Boolean(form.tax_expiry.trim());
  const phvReady =
    form.category !== "phv_taxi_licence" || Boolean((form.phv_start_date || form.occurred_on).trim());
  const busy = pending || overlay?.phase === "pending";

  useEffect(() => {
    setRecords(initial.records);
    setTotalAmount(initial.totalAmount);
    setYearTotalAmount(initial.yearTotalAmount);
  }, [initial.records, initial.totalAmount, initial.yearTotalAmount]);

  function refreshFromServer() {
    void onDataChange?.();
  }

  function openAdd() {
    setError(null);
    const next = emptyForm(initial.methods, initial.accounts, initial.vehicle);
    setForm(next);
    setBaselineForm(next);
    setFormOpen(true);
  }

  function openEdit(r: MaintenanceRecordRow) {
    setError(null);
    const next = fromRecord(r, initial.methods, initial.accounts, initial.vehicle);
    setForm(next);
    setBaselineForm(next);
    setFormOpen(true);
  }

  function requestCloseForm() {
    if (baselineForm && JSON.stringify(form) !== JSON.stringify(baselineForm)) {
      setDiscardConfirm(true);
      return;
    }
    setFormOpen(false);
  }

  function saveForm() {
    setError(null);
    if (form.category === "tax" && !form.tax_expiry.trim()) {
      setError("Enter the new tax expiry date.");
      return;
    }
    setOverlay({ phase: "pending", title: form.id ? "Updating maintenance…" : "Saving maintenance…", detail: "" });
    startTransition(async () => {
      const motStart = form.mot_date || form.occurred_on;
      const motExpiry =
        form.mot_expiry.trim() || expiryOneYearFromDate(motStart.slice(0, 10)) || "";
      const phvStart = form.phv_start_date || form.occurred_on;
      const phvExpiry =
        form.phv_licence_expiry.trim() || expiryOneYearFromDate(phvStart.slice(0, 10)) || "";
      const res = await saveMaintenanceRecordAction({
        vehicleId: initial.vehicle.id,
        id: form.id,
        occurred_on: form.occurred_on,
        category: form.category,
        description: form.description,
        amount_gbp: form.amount_gbp,
        odometer_miles: form.odometer_miles,
        paid_to: form.paid_to,
        paid_by_user_id: form.paid_by_user_id || null,
        paid_by_label: form.paid_by_label || null,
        payment_method_id: form.payment_method_id,
        payment_account_id: needsAccount ? form.payment_account_id || null : null,
        payment_reference: form.payment_reference || null,
        mot_date: form.category === "mot" ? motStart : null,
        mot_expiry: form.category === "mot" ? motExpiry : null,
        tax_expiry: form.category === "tax" ? form.tax_expiry : null,
        phv_start_date: form.category === "phv_taxi_licence" ? phvStart : null,
        phv_licence_expiry: form.category === "phv_taxi_licence" ? phvExpiry : null,
        service_due_at: form.category === "service" ? form.service_due_at || null : null,
        next_service_mileage: form.category === "service" ? form.next_service_mileage || null : null,
      });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not save", detail: res.error });
        setError(res.error);
        return;
      }
      setFormOpen(false);
      refreshFromServer();

      if (form.category === "mot" && res.mot_expiry) {
        setOverlay(null);
        setDocConfirmChecked(false);
        setDocConfirm({ kind: "mot", expiry: res.mot_expiry });
        return;
      }
      if (form.category === "phv_taxi_licence" && res.phv_licence_expiry) {
        setOverlay(null);
        setDocConfirmChecked(false);
        setDocConfirm({ kind: "phv_taxi_licence", expiry: res.phv_licence_expiry });
        return;
      }

      const detail =
        res.tax_expiry != null
          ? `Vehicle tax expiry set to ${formatUkDate(res.tax_expiry)}.`
          : "Expense saved.";
      setOverlay({ phase: "success", title: "Maintenance saved", detail });
    });
  }

  function openDelete(r: MaintenanceRecordRow) {
    setDeleteTarget(r);
    setDeleteMode("keep");
    setDeleteDates({
      mot_expiry: initial.vehicle.mot_expiry?.slice(0, 10) ?? "",
      tax_expiry: initial.vehicle.tax_expiry?.slice(0, 10) ?? "",
      phv_licence_expiry: initial.vehicle.phv_licence_expiry?.slice(0, 10) ?? "",
      service_due_at: initial.vehicle.service_due_at?.slice(0, 10) ?? "",
      next_service_mileage:
        initial.vehicle.next_service_mileage != null ? String(initial.vehicle.next_service_mileage) : "",
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const category = deleteTarget.category;
    const needsDatePrompt =
      category === "mot" || category === "tax" || category === "phv_taxi_licence" || category === "service";
    setOverlay({ phase: "pending", title: "Deleting…", detail: "" });
    startTransition(async () => {
      const res = await deleteMaintenanceRecordAction({
        vehicleId: initial.vehicle.id,
        id,
        correctVehicleDates: needsDatePrompt && deleteMode === "correct",
        mot_expiry: deleteDates.mot_expiry || null,
        tax_expiry: deleteDates.tax_expiry || null,
        phv_licence_expiry: deleteDates.phv_licence_expiry || null,
        service_due_at: deleteDates.service_due_at || null,
        next_service_mileage: deleteDates.next_service_mileage || null,
      });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not delete", detail: res.error });
        return;
      }
      setDeleteTarget(null);
      setOverlay({ phase: "success", title: "Deleted", detail: "" });
      refreshFromServer();
    });
  }

  async function downloadTemplate() {
    setOverlay({ phase: "pending", title: "Preparing Excel template…", detail: "" });
    const res = await getMaintenanceExcelTemplateAction(initial.vehicle.id);
    if (!res.ok) {
      setOverlay({ phase: "error", title: "Could not download template", detail: res.error });
      return;
    }
    const bytes = Uint8Array.from(atob(res.fileBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.fileName;
    a.click();
    URL.revokeObjectURL(url);
    setOverlay(null);
  }

  function onImportFile(file: File | null) {
    if (!file) return;
    setError(null);
    setOverlay({ phase: "pending", title: "Reading file…", detail: "" });
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        setOverlay({ phase: "error", title: "Could not read file", detail: "" });
        return;
      }
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const fileBase64 = btoa(binary);
      startTransition(async () => {
        const res = await previewMaintenanceImportAction({
          vehicleId: initial.vehicle.id,
          fileBase64,
          fileName: file.name,
        });
        if (!res.ok) {
          setOverlay({ phase: "error", title: "Could not parse file", detail: res.error });
          setError(res.error);
          return;
        }
        setCsvPreview(res.rows);
        setCsvStats({ validCount: res.validCount, invalidCount: res.invalidCount });
        setOverlay(null);
      });
    };
    reader.onerror = () => {
      setOverlay({ phase: "error", title: "Could not read file", detail: "" });
    };
    reader.readAsArrayBuffer(file);
  }

  function confirmImport() {
    if (!csvPreview?.length) return;
    setOverlay({ phase: "pending", title: "Importing…", detail: "" });
    startTransition(async () => {
      const res = await importMaintenanceCsvAction({ vehicleId: initial.vehicle.id, rows: csvPreview });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Import failed", detail: res.error  });
        return;
      }
      setOverlay({
        phase: "success",
        title: "Import complete",
        detail: `Imported ${res.imported} row${res.imported === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped}` : ""}.`,
      });
      setCsvOpen(false);
      setCsvPreview(null);
      setCsvStats(null);
      refreshFromServer();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Maintenance</h1>
          <p className="rph-muted mt-1 text-sm">
            Expense history for {initial.vehicle.make} {initial.vehicle.model}{" "}
            <span className="font-mono font-semibold text-rph-fg">{initial.vehicle.vrm}</span>.
          </p>
        </div>
        {initial.canWrite ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rph-rail px-3 text-xs font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
                disabled={busy}
              >
                Actions
                <svg className="h-3.5 w-3.5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg"
              >
                <DropdownMenu.Item
                  className="flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[highlighted]:bg-rph-chrome"
                  onSelect={() => openAdd()}
                >
                  Add maintenance
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[highlighted]:bg-rph-chrome"
                  onSelect={() => {
                    void downloadTemplate();
                  }}
                >
                  Export template
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[highlighted]:bg-rph-chrome"
                  onSelect={() => {
                    setCsvPreview(null);
                    setCsvStats(null);
                    setCsvOpen(true);
                  }}
                >
                  Import
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {!activeAccounts.length && initial.canWrite ? (
        <div className="rph-alert-warn text-sm">
          Add at least one payment account under Settings → Payments for Card / Bank transfer expenses. Cash does not
          need an account.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Total spent</p>
          <p className="mt-1 text-2xl font-bold text-rph-fg">{formatGbp(totalAmount)}</p>
        </div>
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">This year</p>
          <p className="mt-1 text-2xl font-bold text-rph-fg">{formatGbp(yearTotalAmount)}</p>
        </div>
      </div>

      {!records.length ? (
        <p className="rph-muted text-sm">No maintenance expenses recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rph-border">
          <table className="min-w-full divide-y divide-rph-border text-sm">
            <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Description</th>
                <th className="px-3 py-2.5 font-semibold">Amount</th>
                <th className="px-3 py-2.5 font-semibold">Paid to</th>
                <th className="px-3 py-2.5 font-semibold">Paid by</th>
                <th className="px-3 py-2.5 font-semibold">Method</th>
                <th className="px-3 py-2.5 font-semibold">Account</th>
                <th className="px-3 py-2.5 font-semibold">Reference</th>
                {initial.canWrite ? <th className="px-3 py-2.5 font-semibold" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-rph-border">
              {records.map((r) => (
                <tr key={r.id} className="bg-rph-raised">
                  <td className="whitespace-nowrap px-3 py-2.5 text-rph-fg-secondary">{formatUkDate(r.occurred_on)}</td>
                  <td className="px-3 py-2.5 text-rph-fg-secondary">{MAINTENANCE_CATEGORY_LABELS[r.category]}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-rph-fg" title={r.description}>
                    {r.description || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-rph-fg">{formatGbp(r.amount_gbp)}</td>
                  <td className="px-3 py-2.5 text-rph-fg-muted">{r.paid_to || "—"}</td>
                  <td className="px-3 py-2.5 text-rph-fg-muted">{r.paid_by_display || "—"}</td>
                  <td className="px-3 py-2.5 text-rph-fg-muted">{r.payment_method_name || "—"}</td>
                  <td className="px-3 py-2.5 text-rph-fg-muted">{r.payment_account_name || "—"}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2.5 text-rph-fg-muted" title={r.payment_reference || undefined}>
                    {r.payment_reference || "—"}
                  </td>
                  {initial.canWrite ? (
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-rph-border bg-rph-raised px-2 text-xs font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50"
                            disabled={busy}
                          >
                            Manage
                            <svg className="h-3 w-3 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={4}
                            className="z-[200] min-w-[8.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg"
                          >
                            <DropdownMenu.Item
                              className="flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[highlighted]:bg-rph-chrome"
                              onSelect={() => openEdit(r)}
                            >
                              Edit
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="flex cursor-default select-none items-center px-3 py-2 text-sm text-red-700 outline-none data-[highlighted]:bg-rph-chrome dark:text-red-300"
                              onSelect={() => openDelete(r)}
                            >
                              Delete
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormModalShell
        open={formOpen}
        titleId="maintenance-form-title"
        title={form.id ? "Edit maintenance" : "Add maintenance"}
        description="Log an expense against this vehicle, including how it was paid."
        showDraftActions={false}
        pending={busy}
        isDirty={baselineForm ? JSON.stringify(form) !== JSON.stringify(baselineForm) : false}
        maxWidthClass="max-w-2xl"
        onRequestClose={requestCloseForm}
        discardConfirmOpen={discardConfirm}
        onConfirmDiscard={() => {
          setDiscardConfirm(false);
          setFormOpen(false);
        }}
        onCancelDiscard={() => setDiscardConfirm(false)}

        footer={
          <div className="rph-btn-modal-footer">
            <button
              type="button"
              className="rph-btn-primary"
              disabled={
                busy ||
                !form.payment_method_id ||
                (needsAccount && !form.payment_account_id) ||
                !taxReady ||
                !phvReady
              }
              onClick={saveForm}
            >
              Save
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Date</span>
            <input
              type="date"
              className="rph-input"
              value={form.occurred_on}
              onChange={(e) => setForm((p) => ({ ...p, occurred_on: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Category</span>
            <select
              className="rph-input"
              value={form.category}
              onChange={(e) => {
                const category = e.target.value as MaintenanceCategory;
                setForm((p) => {
                  const next = { ...p, category };
                  if (category === "mot") {
                    const start = p.mot_date || p.occurred_on;
                    next.mot_date = start;
                    next.mot_expiry = expiryOneYearFromDate(start.slice(0, 10)) ?? "";
                  }
                  if (category === "tax") {
                    next.tax_expiry = "";
                  }
                  if (category === "phv_taxi_licence") {
                    const start = p.phv_start_date || p.occurred_on;
                    next.phv_start_date = start;
                    next.phv_licence_expiry = expiryOneYearFromDate(start.slice(0, 10)) ?? "";
                  }
                  return next;
                });
              }}
            >
              {MAINTENANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MAINTENANCE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-rph-fg-muted">Description</span>
            <input
              className="rph-input"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Amount (GBP)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="rph-input"
              value={form.amount_gbp}
              onChange={(e) => setForm((p) => ({ ...p, amount_gbp: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Odometer (miles)</span>
            <input
              type="number"
              min={0}
              className="rph-input"
              value={form.odometer_miles}
              onChange={(e) => setForm((p) => ({ ...p, odometer_miles: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Paid to</span>
            <input
              className="rph-input"
              placeholder="Garage / supplier"
              value={form.paid_to}
              onChange={(e) => setForm((p) => ({ ...p, paid_to: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Paid by (staff)</span>
            <select
              className="rph-input"
              value={form.paid_by_user_id}
              onChange={(e) => setForm((p) => ({ ...p, paid_by_user_id: e.target.value, paid_by_label: "" }))}
            >
              <option value="">Other / not listed</option>
              {initial.staff.map((s: MaintenanceStaffOption) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {!form.paid_by_user_id ? (
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-rph-fg-muted">Paid by (name)</span>
              <input
                className="rph-input"
                value={form.paid_by_label}
                onChange={(e) => setForm((p) => ({ ...p, paid_by_label: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Payment method</span>
            <select
              className="rph-input"
              value={form.payment_method_id}
              onChange={(e) => setForm((p) => ({ ...p, payment_method_id: e.target.value }))}
            >
              {!activeMethods.length ? <option value="">No methods configured</option> : null}
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {needsAccount ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-rph-fg-muted">Payment account</span>
              <select
                className="rph-input"
                value={form.payment_account_id}
                onChange={(e) => setForm((p) => ({ ...p, payment_account_id: e.target.value }))}
              >
                {!activeAccounts.length ? <option value="">No accounts configured</option> : null}
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="self-end text-xs text-rph-fg-muted">Cash — no account needed.</p>
          )}
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-rph-fg-muted">Payment reference (optional)</span>
            <input
              className="rph-input"
              placeholder="Bank / card / transfer reference"
              value={form.payment_reference}
              onChange={(e) => setForm((p) => ({ ...p, payment_reference: e.target.value }))}
            />
          </label>

          {form.category === "mot" ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">MOT start date</span>
                  <input
                    type="date"
                    className="rph-input"
                    value={form.mot_date || form.occurred_on}
                    onChange={(e) => {
                      const start = e.target.value;
                      setForm((p) => ({
                        ...p,
                        mot_date: start,
                        mot_expiry: expiryOneYearFromDate(start.slice(0, 10)) ?? "",
                      }));
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">MOT expiry</span>
                  <input
                    type="date"
                    className="rph-input"
                    value={form.mot_expiry}
                    onChange={(e) => setForm((p) => ({ ...p, mot_expiry: e.target.value }))}
                  />
                </label>
              </div>
              <p className="text-xs text-rph-fg-muted">
                Expiry defaults to start date + 1 year
                {previewMotExpiry ? (
                  <>
                    {" "}
                    (
                    <span className="font-semibold text-rph-fg">{formatUkDate(previewMotExpiry)}</span>
                    ). You can change it if needed.
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          ) : null}

          {form.category === "tax" ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3 sm:col-span-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">New tax expiry</span>
                <input
                  type="date"
                  className="rph-input"
                  value={form.tax_expiry}
                  onChange={(e) => setForm((p) => ({ ...p, tax_expiry: e.target.value }))}
                />
              </label>
              <p className="text-xs text-rph-fg-muted">
                Enter the new tax expiry from the DVLA disc / confirmation. Leave blank until you have it.
              </p>
            </div>
          ) : null}

          {form.category === "phv_taxi_licence" ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">PHV/Taxi licence start date</span>
                  <input
                    type="date"
                    className="rph-input"
                    value={form.phv_start_date || form.occurred_on}
                    onChange={(e) => {
                      const start = e.target.value;
                      setForm((p) => ({
                        ...p,
                        phv_start_date: start,
                        phv_licence_expiry: expiryOneYearFromDate(start.slice(0, 10)) ?? "",
                      }));
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">PHV/Taxi licence expiry</span>
                  <input
                    type="date"
                    className="rph-input"
                    value={form.phv_licence_expiry}
                    onChange={(e) => setForm((p) => ({ ...p, phv_licence_expiry: e.target.value }))}
                  />
                </label>
              </div>
              <p className="text-xs text-rph-fg-muted">
                Expiry defaults to start date + 1 year
                {previewPhvExpiry ? (
                  <>
                    {" "}
                    (
                    <span className="font-semibold text-rph-fg">{formatUkDate(previewPhvExpiry)}</span>
                    ). You can change it if the licence term differs.
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          ) : null}

          {form.category === "service" ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Update vehicle service</p>
              <p className="text-xs text-rph-fg-muted">Optional — leave blank to keep current vehicle values.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">Next service due</span>
                  <input
                    type="date"
                    className="rph-input"
                    value={form.service_due_at}
                    onChange={(e) => setForm((p) => ({ ...p, service_due_at: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-rph-fg-muted">Next service miles</span>
                  <input
                    type="number"
                    min={0}
                    className="rph-input"
                    value={form.next_service_mileage}
                    onChange={(e) => setForm((p) => ({ ...p, next_service_mileage: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </FormModalShell>

      <FormModalShell
        open={csvOpen}
        titleId="maintenance-import-title"
        title="Import maintenance"
        description="Upload an Excel template (.xlsx) with dropdowns, or a CSV with the same columns. Invalid rows are skipped."
        showDraftActions={false}
        pending={busy}
        isDirty={Boolean(csvPreview?.length)}
        maxWidthClass="max-w-2xl"
        onRequestClose={() => {
          if (csvPreview?.length) {
            setCsvDiscardConfirm(true);
            return;
          }
          setCsvOpen(false);
        }}
        discardConfirmOpen={csvDiscardConfirm}
        onConfirmDiscard={() => {
          setCsvDiscardConfirm(false);
          setCsvOpen(false);
          setCsvPreview(null);
          setCsvStats(null);
        }}
        onCancelDiscard={() => setCsvDiscardConfirm(false)}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <button type="button" className="rph-btn-ghost" disabled={busy} onClick={downloadTemplate}>
              Download Excel template
            </button>
            <button type="button" className="rph-btn-primary" disabled={busy || !csvStats?.validCount} onClick={confirmImport}>
              Import {csvStats?.validCount ? `(${csvStats.validCount})` : ""}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-rph-fg-secondary"
            disabled={busy}
            onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}
          />
          {csvStats ? (
            <p className="text-sm text-rph-fg-secondary">
              {csvStats.validCount} valid · {csvStats.invalidCount} invalid
            </p>
          ) : null}
          {csvPreview?.length ? (
            <div className="max-h-64 overflow-auto rounded-lg border border-rph-border">
              <table className="min-w-full text-xs">
                <thead className="bg-rph-chrome text-left text-rph-fg-muted">
                  <tr>
                    <th className="px-2 py-1.5">Line</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rph-border">
                  {csvPreview.map((r) => (
                    <tr key={r.line} className={r.ok ? "" : "bg-red-50/80 dark:bg-red-950/30"}>
                      <td className="px-2 py-1.5">{r.line}</td>
                      <td className="px-2 py-1.5 font-semibold">{r.ok ? "OK" : "Error"}</td>
                      <td className="px-2 py-1.5">
                        {r.ok
                          ? `${formatUkDate(r.occurred_on)} · ${r.category} · ${formatGbp(r.amount_gbp ?? 0)} · ${r.payment_method}${r.payment_account ? ` / ${r.payment_account}` : ""}`
                          : r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rph-meta">
              Columns include category, payment_method, payment_account, payment_reference, mot_date, mot_expiry,
              tax_expiry, phv_start_date, phv_licence_expiry, service_due_at, next_service_mileage.
              Cash rows can leave payment_account blank. MOT/PHV rows default expiry to start + 1 year
              (override with mot_expiry / phv_licence_expiry).
            </p>
          )}
        </div>
      </FormModalShell>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-delete-title"
            className="relative z-[1] w-full max-w-md rounded-2xl border border-rph-border bg-rph-raised p-6 shadow-2xl"
          >
            <h2 id="maintenance-delete-title" className="text-lg font-semibold text-rph-fg">
              Delete maintenance record?
            </h2>
            <p className="mt-2 text-sm text-rph-fg-secondary">
              This removes the expense from this vehicle’s history. This cannot be undone.
            </p>
            {deleteTarget.category === "mot" ||
            deleteTarget.category === "tax" ||
            deleteTarget.category === "phv_taxi_licence" ||
            deleteTarget.category === "service" ? (
              <div className="mt-4 space-y-3 rounded-lg border border-rph-border p-3">
                <p className="text-xs text-rph-fg-muted">
                  Vehicle {MAINTENANCE_CATEGORY_LABELS[deleteTarget.category]} dates are{" "}
                  <span className="font-semibold text-rph-fg">not rolled back</span> automatically.
                </p>
                <label className="flex items-start gap-2 text-sm text-rph-fg">
                  <input
                    type="radio"
                    name="delete-date-mode"
                    className="mt-0.5"
                    checked={deleteMode === "keep"}
                    onChange={() => setDeleteMode("keep")}
                  />
                  <span>Keep current vehicle dates</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-rph-fg">
                  <input
                    type="radio"
                    name="delete-date-mode"
                    className="mt-0.5"
                    checked={deleteMode === "correct"}
                    onChange={() => setDeleteMode("correct")}
                  />
                  <span>Correct vehicle dates now</span>
                </label>
                {deleteMode === "correct" ? (
                  <div className="grid gap-2 pt-1">
                    {deleteTarget.category === "mot" ? (
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-rph-fg-muted">MOT expiry</span>
                        <input
                          type="date"
                          className="rph-input"
                          value={deleteDates.mot_expiry}
                          onChange={(e) => setDeleteDates((p) => ({ ...p, mot_expiry: e.target.value }))}
                        />
                      </label>
                    ) : null}
                    {deleteTarget.category === "tax" ? (
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-rph-fg-muted">Tax expiry</span>
                        <input
                          type="date"
                          className="rph-input"
                          value={deleteDates.tax_expiry}
                          onChange={(e) => setDeleteDates((p) => ({ ...p, tax_expiry: e.target.value }))}
                        />
                      </label>
                    ) : null}
                    {deleteTarget.category === "phv_taxi_licence" ? (
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-rph-fg-muted">PHV/Taxi licence expiry</span>
                        <input
                          type="date"
                          className="rph-input"
                          value={deleteDates.phv_licence_expiry}
                          onChange={(e) =>
                            setDeleteDates((p) => ({ ...p, phv_licence_expiry: e.target.value }))
                          }
                        />
                      </label>
                    ) : null}
                    {deleteTarget.category === "service" ? (
                      <>
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-rph-fg-muted">Next service due</span>
                          <input
                            type="date"
                            className="rph-input"
                            value={deleteDates.service_due_at}
                            onChange={(e) =>
                              setDeleteDates((p) => ({ ...p, service_due_at: e.target.value }))
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-rph-fg-muted">Next service miles</span>
                          <input
                            type="number"
                            min={0}
                            className="rph-input"
                            value={deleteDates.next_service_mileage}
                            onChange={(e) =>
                              setDeleteDates((p) => ({ ...p, next_service_mileage: e.target.value }))
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rph-btn-ghost"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button type="button" className="rph-btn-primary" disabled={busy} onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {docConfirm ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-doc-confirm-title"
            className="relative z-[1] w-full max-w-md rounded-2xl border border-rph-border bg-rph-raised p-6 shadow-2xl"
          >
            <div className="rph-alert-warn text-sm">
              Upload the new {docConfirm.kind === "mot" ? "MOT certificate" : "PHV/Taxi licence paper"} on
              Documents so the vehicle file stays up to date.
            </div>
            <h2 id="maintenance-doc-confirm-title" className="mt-4 text-lg font-semibold text-rph-fg">
              Confirm document updated
            </h2>
            <p className="mt-2 text-sm text-rph-fg-secondary">
              {docConfirm.kind === "mot" ? "MOT" : "PHV/Taxi licence"} expiry is now{" "}
              <span className="font-semibold text-rph-fg">{formatUkDate(docConfirm.expiry)}</span>.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-rph-fg">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={docConfirmChecked}
                onChange={(e) => setDocConfirmChecked(e.target.checked)}
              />
              <span>
                {docConfirm.kind === "mot"
                  ? "I confirm the new MOT certificate has been uploaded (or will be uploaded now)."
                  : "I confirm the new PHV/Taxi licence paper has been uploaded (or will be uploaded now)."}
              </span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rph-btn-ghost"
                onClick={() => {
                  setDocConfirm(null);
                  setDocConfirmChecked(false);
                }}
              >
                Skip for now
              </button>
              <Link
                href={`/rental/vehicles/${initial.vehicle.id}/details#documents`}
                className="rph-btn-ghost inline-flex shrink-0 items-center justify-center"
                onClick={() => {
                  setDocConfirm(null);
                  setDocConfirmChecked(false);
                }}
              >
                Open Documents
              </Link>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-rph-rail px-3 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
                disabled={!docConfirmChecked}
                onClick={() => {
                  setDocConfirm(null);
                  setDocConfirmChecked(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
