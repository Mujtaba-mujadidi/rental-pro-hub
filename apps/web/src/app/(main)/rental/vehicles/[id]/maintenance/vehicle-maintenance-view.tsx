"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMaintenanceRecordAction,
  getMaintenanceCsvTemplateAction,
  importMaintenanceCsvAction,
  previewMaintenanceCsvAction,
  saveMaintenanceRecordAction,
  type CsvImportPreviewRow,
  type MaintenanceStaffOption,
  type VehicleMaintenancePageData,
} from "@/app/actions/rental-maintenance";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formatUkDate } from "@/lib/datetime/uk";
import {
  formatGbp,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
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
  update_service_fields: boolean;
  service_due_at: string;
  next_service_mileage: string;
};

function emptyForm(methods: PaymentMethodRow[], accounts: PaymentAccountRow[]): FormState {
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
    update_service_fields: false,
    service_due_at: "",
    next_service_mileage: "",
  };
}

function fromRecord(r: MaintenanceRecordRow, methods: PaymentMethodRow[], accounts: PaymentAccountRow[]): FormState {
  const base = emptyForm(methods, accounts);
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
    payment_account_id: r.payment_account_id,
  };
}

export function VehicleMaintenanceView({ initial }: { initial: VehicleMaintenancePageData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState(initial.records);
  const [totalAmount, setTotalAmount] = useState(initial.totalAmount);
  const [yearTotalAmount, setYearTotalAmount] = useState(initial.yearTotalAmount);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(initial.methods, initial.accounts));
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [csvDiscardConfirm, setCsvDiscardConfirm] = useState(false);
  const [baselineForm, setBaselineForm] = useState<FormState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CsvImportPreviewRow[] | null>(null);
  const [csvStats, setCsvStats] = useState<{ validCount: number; invalidCount: number } | null>(null);

  const activeMethods = useMemo(() => initial.methods.filter((m) => m.is_active), [initial.methods]);
  const activeAccounts = useMemo(() => initial.accounts.filter((a) => a.is_active), [initial.accounts]);
  const busy = pending || overlay?.phase === "pending";

  useEffect(() => {
    setRecords(initial.records);
    setTotalAmount(initial.totalAmount);
    setYearTotalAmount(initial.yearTotalAmount);
  }, [initial.records, initial.totalAmount, initial.yearTotalAmount]);

  function refreshFromServer() {
    router.refresh();
  }

  function openAdd() {
    setError(null);
    const next = emptyForm(initial.methods, initial.accounts);
    setForm(next);
    setBaselineForm(next);
    setFormOpen(true);
  }

  function openEdit(r: MaintenanceRecordRow) {
    setError(null);
    const next = fromRecord(r, initial.methods, initial.accounts);
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
    setOverlay({ phase: "pending", title: form.id ? "Updating maintenance…" : "Saving maintenance…", detail: "" });
    startTransition(async () => {
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
        payment_account_id: form.payment_account_id,
        update_service_fields: form.update_service_fields,
        service_due_at: form.service_due_at || null,
        next_service_mileage: form.next_service_mileage || null,
      });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not save", detail: res.error  });
        setError(res.error);
        return;
      }
      setOverlay({ phase: "success", title: "Maintenance saved", detail: "" });
      setFormOpen(false);
      refreshFromServer();
    });
  }

  function confirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setOverlay({ phase: "pending", title: "Deleting…", detail: "" });
    startTransition(async () => {
      const res = await deleteMaintenanceRecordAction({ vehicleId: initial.vehicle.id, id });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not delete", detail: res.error  });
        return;
      }
      setDeleteId(null);
      setOverlay({ phase: "success", title: "Deleted", detail: "" });
      refreshFromServer();
    });
  }

  async function downloadTemplate() {
    const res = await getMaintenanceCsvTemplateAction();
    if (!res.ok) return;
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-template-${initial.vehicle.vrm}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onCsvFile(file: File | null) {
    if (!file) return;
    setError(null);
    setOverlay({ phase: "pending", title: "Reading CSV…", detail: "" });
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startTransition(async () => {
        const res = await previewMaintenanceCsvAction({ vehicleId: initial.vehicle.id, csvText: text });
        if (!res.ok) {
          setOverlay({ phase: "error", title: "Could not parse CSV", detail: res.error  });
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
    reader.readAsText(file);
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-3 text-xs font-semibold text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setCsvPreview(null);
                setCsvStats(null);
                setCsvOpen(true);
              }}
            >
              Import CSV
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-rph-rail px-3 text-xs font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
              disabled={busy}
              onClick={openAdd}
            >
              Add maintenance
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {!activeAccounts.length && initial.canWrite ? (
        <div className="rph-alert-warn text-sm">
          Add at least one payment account under Settings → Payments before logging expenses.
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
                  {initial.canWrite ? (
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button type="button" className="rph-btn-ghost h-7 px-2 text-xs" disabled={busy} onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rph-btn-ghost h-7 px-2 text-xs text-red-700 dark:text-red-300"
                        disabled={busy}
                        onClick={() => setDeleteId(r.id)}
                      >
                        Delete
                      </button>
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
          <div className="ml-auto">
            <button
              type="button"
              className="rph-btn-primary"
              disabled={busy || !form.payment_method_id || !form.payment_account_id}
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
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as MaintenanceCategory }))}
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
          {form.category === "service" ? (
            <div className="space-y-2 rounded-lg border border-rph-border p-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-rph-fg-secondary">
                <input
                  type="checkbox"
                  checked={form.update_service_fields}
                  onChange={(e) => setForm((p) => ({ ...p, update_service_fields: e.target.checked }))}
                />
                Also update vehicle service due / next service miles
              </label>
              {form.update_service_fields ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      </FormModalShell>

      <FormModalShell
        open={csvOpen}
        titleId="maintenance-csv-title"
        title="Import maintenance CSV"
        description="Upload one or more expense rows for this vehicle. Invalid rows are skipped."
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
              Download template
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
            accept=".csv,text/csv"
            className="block w-full text-sm text-rph-fg-secondary"
            disabled={busy}
            onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)}
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
                          ? `${r.occurred_on} · ${r.category} · ${formatGbp(r.amount_gbp ?? 0)} · ${r.payment_method} / ${r.payment_account}`
                          : r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rph-meta">
              Columns: occurred_on, category, description, amount_gbp, paid_to, paid_by, payment_method,
              payment_account, odometer_miles
            </p>
          )}
        </div>
      </FormModalShell>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete maintenance record?"
        description="This removes the expense from this vehicle’s history. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        pending={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
