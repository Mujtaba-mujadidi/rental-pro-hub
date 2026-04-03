"use client";

import { savePricingPresetAction, type PricingPresetRow } from "@/app/actions/contract-presets";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const listBroken = Boolean(loadError);

  const sortedRows = useMemo(
    () => [...initialRows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [initialRows],
  );

  const defaults = draft?.mode === "edit" ? parametersFormDefaults(draft.row) : { monthly: "", parametersJson: "" };

  const closeModal = () => {
    if (pending) return;
    setDraft(null);
    setErr(null);
  };

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || pendingRef.current) return;
      setDraft(null);
      setErr(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

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
              setDraft({ mode: "create" });
              setMsg(null);
              setErr(null);
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
                          setDraft({ mode: "edit", row: p });
                          setMsg(null);
                          setErr(null);
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

      {draft ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] dark:bg-black/55"
            aria-label="Close dialog"
            disabled={pending}
            onMouseDown={() => {
              if (!pending) closeModal();
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="preset-modal-title"
            className="relative z-[1] flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55)] sm:max-h-[85vh] sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
              <h2 id="preset-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {draft.mode === "edit" ? "Edit preset" : "New preset"}
              </h2>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={closeModal}
              >
                Close
              </button>
            </div>

            <form
              key={draft.mode === "edit" ? draft.row.id : "new"}
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setMsg(null);
                setErr(null);
                startTransition(() => {
                  void (async () => {
                    const res = await savePricingPresetAction(fd);
                    if (!res.ok) setErr(res.error);
                    else {
                      setMsg(draft.mode === "edit" ? "Preset updated." : "Preset created.");
                      setDraft(null);
                      router.refresh();
                    }
                  })();
                });
              }}
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                {draft.mode === "edit" ? <input type="hidden" name="id" value={draft.row.id} /> : null}

                <div>
                  <label className={labelClass} htmlFor="preset-name">
                    Preset name
                  </label>
                  <p className={hintClass}>Shown in lists and when choosing a preset at company registration.</p>
                  <input
                    id="preset-name"
                    name="name"
                    required
                    defaultValue={draft.mode === "edit" ? draft.row.name : ""}
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
                    name="pricing_model_type"
                    className={inputClass}
                    defaultValue={draft.mode === "edit" ? draft.row.pricing_model_type : "fixed_monthly"}
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
                    name="billing_frequency"
                    className={inputClass}
                    defaultValue={draft.mode === "edit" ? draft.row.billing_frequency ?? "" : ""}
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
                    name="currency"
                    className={inputClass}
                    defaultValue={draft.mode === "edit" ? draft.row.currency : "GBP"}
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
                    name="monthly_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 299.00"
                    className={inputClass}
                    defaultValue={defaults.monthly}
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
                    name="parameters_json"
                    rows={4}
                    placeholder='{"monthly_amount": 299} or richer structure for custom models'
                    className={inputClass}
                    defaultValue={defaults.parametersJson}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="preset-description">
                    Description (optional)
                  </label>
                  <textarea
                    id="preset-description"
                    name="description"
                    rows={2}
                    className={inputClass}
                    placeholder="Customer-facing or internal summary"
                    defaultValue={draft.mode === "edit" ? draft.row.description ?? "" : ""}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="preset-internal">
                    Internal note (optional)
                  </label>
                  <textarea
                    id="preset-internal"
                    name="internal_note"
                    rows={2}
                    className={inputClass}
                    placeholder="Notes for super-admins only"
                    defaultValue={draft.mode === "edit" ? draft.row.internal_note ?? "" : ""}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={draft.mode === "edit" ? draft.row.is_active : true}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  Active (available when registering a company)
                </label>

                {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50 sm:px-5">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-xl bg-rph-rail py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer sm:w-auto sm:px-6"
                >
                  {pending ? "Saving…" : draft.mode === "edit" ? "Save changes" : "Create preset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
    </div>
  );
}
