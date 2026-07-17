"use client";

import { savePricingPresetAction, type PricingPresetRow } from "@/app/actions/contract-presets";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type FormEvent } from "react";

const PRICING_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "fixed_monthly", label: "Fixed monthly", hint: "Single recurring amount (e.g. platform fee)." },
  { value: "per_vehicle", label: "Per vehicle", hint: "Price scales with each vehicle on the contract." },
  { value: "tiered_vehicles", label: "Tiered by vehicle count", hint: "Bands or steps based on fleet size." },
  { value: "base_plus_per_vehicle", label: "Base + per vehicle", hint: "Flat base plus a rate per unit." },
  { value: "custom", label: "Custom", hint: "Use advanced JSON parameters for anything else." },
];

const BILLING_FREQUENCIES: { value: string; label: string }[] = [
  { value: "", label: "Not set (optional)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
];

const CURRENCIES = ["GBP", "EUR", "USD"] as const;

type Draft = null | { mode: "create" } | { mode: "edit"; row: PricingPresetRow };

function parametersFormDefaults(row: PricingPresetRow): { monthly: string; parametersJson: string } {
  const p = row.parameters;
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return { monthly: "", parametersJson: "" };
  }
  const keys = Object.keys(p as object);
  if (keys.length === 1 && keys[0] === "monthly_amount") {
    const m = (p as { monthly_amount?: unknown }).monthly_amount;
    return {
      monthly: typeof m === "number" && Number.isFinite(m) ? String(m) : "",
      parametersJson: "",
    };
  }
  if (keys.length === 0) {
    return { monthly: "", parametersJson: "" };
  }
  try {
    return { monthly: "", parametersJson: JSON.stringify(p, null, 2) };
  } catch {
    return { monthly: "", parametersJson: "" };
  }
}

function modelLabel(value: string): string {
  return PRICING_MODELS.find((m) => m.value === value)?.label ?? value;
}

/** Display a primary monetary figure from parameters, or a short fallback for complex JSON. */
function presetAmountDisplay(row: PricingPresetRow): { label: string; title?: string } {
  const p = row.parameters;
  const currency = row.currency && row.currency.length === 3 ? row.currency : "GBP";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return { label: "—" };
  }
  const o = p as Record<string, unknown>;
  const monthly = o.monthly_amount;
  if (typeof monthly === "number" && Number.isFinite(monthly)) {
    return { label: fmt(monthly) };
  }
  if (typeof monthly === "string") {
    const n = Number.parseFloat(monthly);
    if (Number.isFinite(n)) return { label: fmt(n) };
  }
  for (const key of ["base_amount", "amount", "fixed_amount", "per_vehicle_rate"] as const) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return { label: fmt(v), title: key.replace(/_/g, " ") };
    }
    if (typeof v === "string") {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return { label: fmt(n), title: key.replace(/_/g, " ") };
    }
  }
  const keys = Object.keys(o);
  if (keys.length > 0) {
    try {
      return { label: "Custom", title: JSON.stringify(o) };
    } catch {
      return { label: "Custom" };
    }
  }
  return { label: "—" };
}

const labelClass = "mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-200";
const hintClass = "mb-2 text-xs text-slate-500 dark:text-slate-400";
const inputClass = "rph-input-auth w-full text-sm";

export function ContractPresetsClient({
  initialRows,
  loadError,
}: {
  initialRows: PricingPresetRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(null);

  type PresetForm = {
    name: string;
    pricing_model_type: string;
    billing_frequency: string;
    currency: string;
    monthly_amount: string;
    parameters_json: string;
    description: string;
    internal_note: string;
    is_active: boolean;
  };

  const emptyPresetForm = useMemo<PresetForm>(
    () => ({
      name: "",
      pricing_model_type: "fixed_monthly",
      billing_frequency: "",
      currency: "GBP",
      monthly_amount: "",
      parameters_json: "",
      description: "",
      internal_note: "",
      is_active: true,
    }),
    [],
  );

  const [form, setForm] = useState<PresetForm>(emptyPresetForm);
  const [formBaseline, setFormBaseline] = useState<PresetForm>(emptyPresetForm);

  const applyPresetSnapshot = useCallback((s: PresetForm) => {
    setForm(s);
    setErr(null);
  }, []);

  const presetDraftKey =
    draft?.mode === "edit" ? `contract-preset:${draft.row.id}` : "contract-preset:create";

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
    draftKey: presetDraftKey,
    open: Boolean(draft),
    snapshot: form,
    baseline: formBaseline,
    pending,
    applySnapshot: applyPresetSnapshot,
    onClose: () => {
      setDraft(null);
      setErr(null);
    },
  });

  const listBroken = Boolean(loadError);

  const sortedRows = useMemo(
    () => [...initialRows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [initialRows],
  );

  function openCreate() {
    setFormBaseline(emptyPresetForm);
    setDraft({ mode: "create" });
    setMsg(null);
    setErr(null);
  }

  function openEdit(row: PricingPresetRow) {
    const defaults = parametersFormDefaults(row);
    const next: PresetForm = {
      name: row.name,
      pricing_model_type: row.pricing_model_type,
      billing_frequency: row.billing_frequency ?? "",
      currency: row.currency,
      monthly_amount: defaults.monthly,
      parameters_json: defaults.parametersJson,
      description: row.description ?? "",
      internal_note: row.internal_note ?? "",
      is_active: row.is_active,
    };
    setFormBaseline(next);
    setDraft({ mode: "edit", row });
    setMsg(null);
    setErr(null);
  }

  function patchForm<K extends keyof PresetForm>(key: K, value: PresetForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submitPreset(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const fd = new FormData();
    if (draft.mode === "edit") fd.set("id", draft.row.id);
    fd.set("name", form.name);
    fd.set("pricing_model_type", form.pricing_model_type);
    fd.set("billing_frequency", form.billing_frequency);
    fd.set("currency", form.currency);
    fd.set("monthly_amount", form.monthly_amount);
    fd.set("parameters_json", form.parameters_json);
    fd.set("description", form.description);
    fd.set("internal_note", form.internal_note);
    if (form.is_active) fd.set("is_active", "on");
    setMsg(null);
    setErr(null);
    startTransition(() => {
      void (async () => {
        const res = await savePricingPresetAction(fd);
        if (!res.ok) setErr(res.error);
        else {
          setMsg(draft.mode === "edit" ? "Preset updated." : "Preset created.");
          clearAfterSuccess();
          setDraft(null);
          router.refresh();
        }
      })();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700/90 dark:bg-slate-950/40">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Current presets</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              These appear when registering a company. Inactive presets are hidden from that picker.
            </p>
          </div>
          <button
            type="button"
            disabled={listBroken}
            title={listBroken ? "Fix database error above before creating presets" : undefined}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:pointer-events-none disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
            onClick={() => {
              openCreate();
            }}
          >
            Create new preset
          </button>
        </div>

        {sortedRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-5">
            {listBroken ? (
              "Presets could not be loaded. Fix the error above, then refresh."
            ) : (
              <>
                No presets yet. Use <span className="font-medium text-slate-700 dark:text-slate-300">Create new preset</span> to add
                one.
              </>
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Name</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Pricing model</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Amount</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Billing period</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Currency</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5">Status</th>
                  <th className="w-[1%] px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 sm:px-5"> </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((p) => {
                  const amount = presetAmountDisplay(p);
                  return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/80 odd:bg-white even:bg-slate-50/40 dark:odd:bg-transparent dark:even:bg-slate-900/20"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 sm:px-5">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 sm:px-5">{modelLabel(p.pricing_model_type)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-slate-800 dark:text-slate-200 sm:px-5">
                      <span title={amount.title}>{amount.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 sm:px-5">
                      {p.billing_frequency ? (
                        <span className="capitalize">{p.billing_frequency.replace(/_/g, " ")}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 sm:px-5">{p.currency}</td>
                    <td className="px-4 py-3 sm:px-5">
                      {p.is_active ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <button
                        type="button"
                        disabled={listBroken}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          openEdit(p);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FormModalShell
        open={Boolean(draft)}
        titleId="preset-modal-title"
        title={draft?.mode === "edit" ? "Edit preset" : "New preset"}
        description="Pricing presets appear when registering a company."
        pending={pending}
        zClass="z-[220]"
        maxWidthClass="max-w-lg"
        saveNotice={saveNotice}
        hasStoredDraft={hasStoredDraft}
        isDirty={isDirty}
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
          <button
            type="submit"
            form="preset-form"
            disabled={pending}
            className="w-full rounded-xl bg-rph-rail py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer sm:w-auto sm:px-6"
          >
            {pending ? "Saving…" : draft?.mode === "edit" ? "Save changes" : "Create preset"}
          </button>
        }
      >
        <form id="preset-form" className="space-y-4" onSubmit={submitPreset}>
          <div>
            <label className={labelClass} htmlFor="preset-name">
              Preset name
            </label>
            <p className={hintClass}>Shown in lists and when choosing a preset at company registration.</p>
            <input
              id="preset-name"
              required
              value={form.name}
              onChange={(e) => patchForm("name", e.target.value)}
              placeholder="e.g. Standard monthly SaaS"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-pricing-model">
              Pricing model
            </label>
            <p className={hintClass}>
              <strong className="font-medium text-slate-600 dark:text-slate-300">Not</strong> the payment calendar — this is{" "}
              <em>how</em> the amount is calculated (fixed fee, per vehicle, tiers, etc.).
            </p>
            <select
              id="preset-pricing-model"
              className={inputClass}
              value={form.pricing_model_type}
              onChange={(e) => patchForm("pricing_model_type", e.target.value)}
            >
              {PRICING_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-billing-frequency">
              Billing period
            </label>
            <p className={hintClass}>
              How often you charge (invoice rhythm): weekly, monthly, quarterly, etc. Separate from the pricing model above.
            </p>
            <select
              id="preset-billing-frequency"
              className={inputClass}
              value={form.billing_frequency}
              onChange={(e) => patchForm("billing_frequency", e.target.value)}
            >
              {BILLING_FREQUENCIES.map((f) => (
                <option key={f.value || "unset"} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-currency">
              Currency
            </label>
            <select
              id="preset-currency"
              className={inputClass}
              value={form.currency}
              onChange={(e) => patchForm("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-monthly">
              Default monthly amount (optional)
            </label>
            <p className={hintClass}>
              For simple <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-800">fixed_monthly</code>{" "}
              presets, stores one number in parameters. If you use advanced JSON below, that takes priority over this field.
            </p>
            <input
              id="preset-monthly"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 299.00"
              className={inputClass}
              value={form.monthly_amount}
              onChange={(e) => patchForm("monthly_amount", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-params-json">
              Advanced parameters (JSON, optional)
            </label>
            <p className={hintClass}>
              Override or extend stored{" "}
              <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-800">parameters</code> (tiers, rates,
              etc.). Leave empty to use only the monthly amount field, or when editing without changing parameters.
            </p>
            <textarea
              id="preset-params-json"
              rows={4}
              placeholder='{"monthly_amount": 299} or richer structure for custom models'
              className={inputClass}
              value={form.parameters_json}
              onChange={(e) => patchForm("parameters_json", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-description">
              Description (optional)
            </label>
            <textarea
              id="preset-description"
              rows={2}
              className={inputClass}
              placeholder="Customer-facing or internal summary"
              value={form.description}
              onChange={(e) => patchForm("description", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="preset-internal">
              Internal note (optional)
            </label>
            <textarea
              id="preset-internal"
              rows={2}
              className={inputClass}
              placeholder="Notes for super-admins only"
              value={form.internal_note}
              onChange={(e) => patchForm("internal_note", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => patchForm("is_active", e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            Active (available when registering a company)
          </label>
          {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
        </form>
      </FormModalShell>

      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
    </div>
  );
}
