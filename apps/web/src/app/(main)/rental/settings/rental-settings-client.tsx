"use client";

import { useEffect, useState, useTransition } from "react";
import {
  loadCompanyNotificationSettingsAction,
  saveCompanyNotificationSettingsAction,
} from "@/app/actions/rental-settings";
import {
  createPaymentAccountAction,
  createPaymentMethodAction,
  loadPaymentSettingsAction,
  updatePaymentAccountAction,
  updatePaymentMethodAction,
} from "@/app/actions/rental-payment-settings";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import {
  DEFAULT_NOTIFY_MOT_DAYS,
  DEFAULT_NOTIFY_PHV_LICENCE_DAYS,
  DEFAULT_NOTIFY_TAX_DAYS,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import type { PaymentAccountRow, PaymentMethodRow } from "@/lib/fleet/maintenance";

type SettingsTab = "notifications" | "payments";

export function RentalSettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("notifications");
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyNotificationSettings>({
    notify_mot_days_before: DEFAULT_NOTIFY_MOT_DAYS,
    notify_tax_days_before: DEFAULT_NOTIFY_TAX_DAYS,
    notify_phv_licence_days_before: DEFAULT_NOTIFY_PHV_LICENCE_DAYS,
  });
  const [loaded, setLoaded] = useState(false);
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccountRow[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [newMethodName, setNewMethodName] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountNotes, setNewAccountNotes] = useState("");

  useEffect(() => {
    startTransition(async () => {
      const res = await loadCompanyNotificationSettingsAction();
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setForm(res.settings);
      setCanManage(res.canManage);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (tab !== "payments" || paymentsLoaded) return;
    startTransition(async () => {
      const res = await loadPaymentSettingsAction();
      if (!res.ok) {
        setError(res.error);
        setPaymentsLoaded(true);
        return;
      }
      setMethods(res.methods);
      setAccounts(res.accounts);
      setCanManage(res.canManage);
      setPaymentsLoaded(true);
    });
  }, [tab, paymentsLoaded]);

  function saveNotifications() {
    setError(null);
    setMessage(null);
    setOverlay({
      phase: "pending",
      title: "Saving notification settings…",
      detail: "Updating how many days before expiry to notify your team.",
    });
    startTransition(async () => {
      const res = await saveCompanyNotificationSettingsAction(form);
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not save settings", detail: res.error  });
        setError(res.error);
        return;
      }
      setOverlay({
        phase: "success",
        title: "Settings saved",
        detail: "Expiry notification lead times have been updated.",
      });
      setMessage("Notification settings saved.");
    });
  }

  async function reloadPayments() {
    const res = await loadPaymentSettingsAction();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMethods(res.methods);
    setAccounts(res.accounts);
  }

  function addMethod() {
    setError(null);
    setMessage(null);
    const name = newMethodName.trim();
    if (!name) return;
    setOverlay({ phase: "pending", title: "Adding payment method…", detail: "" });
    startTransition(async () => {
      const res = await createPaymentMethodAction({ name });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not add method", detail: res.error  });
        setError(res.error);
        return;
      }
      setNewMethodName("");
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment method added", detail: "" });
    });
  }

  function addAccount() {
    setError(null);
    setMessage(null);
    const name = newAccountName.trim();
    if (!name) return;
    setOverlay({ phase: "pending", title: "Adding payment account…", detail: "" });
    startTransition(async () => {
      const res = await createPaymentAccountAction({ name, notes: newAccountNotes });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not add account", detail: res.error  });
        setError(res.error);
        return;
      }
      setNewAccountName("");
      setNewAccountNotes("");
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment account added", detail: "" });
    });
  }

  function toggleMethod(m: PaymentMethodRow) {
    setOverlay({ phase: "pending", title: m.is_active ? "Deactivating…" : "Activating…", detail: "" });
    startTransition(async () => {
      const res = await updatePaymentMethodAction({ id: m.id, is_active: !m.is_active });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not update method", detail: res.error  });
        return;
      }
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment method updated", detail: "" });
    });
  }

  function toggleAccount(a: PaymentAccountRow) {
    setOverlay({ phase: "pending", title: a.is_active ? "Deactivating…" : "Activating…", detail: "" });
    startTransition(async () => {
      const res = await updatePaymentAccountAction({ id: a.id, is_active: !a.is_active });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not update account", detail: res.error  });
        return;
      }
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment account updated", detail: "" });
    });
  }

  function renameMethod(m: PaymentMethodRow, name: string) {
    const next = name.trim();
    if (!next || next === m.name) return;
    startTransition(async () => {
      const res = await updatePaymentMethodAction({ id: m.id, name: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await reloadPayments();
    });
  }

  function renameAccount(a: PaymentAccountRow, name: string) {
    const next = name.trim();
    if (!next || next === a.name) return;
    startTransition(async () => {
      const res = await updatePaymentAccountAction({ id: a.id, name: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await reloadPayments();
    });
  }

  const busy = pending || overlay?.phase === "pending";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Settings</h1>
        <p className="rph-muted mt-1 text-sm">Company preferences for your rental organisation.</p>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="inline-flex rounded-xl bg-rph-chrome p-1 ring-1 ring-rph-border"
      >
        {(
          [
            ["notifications", "Notifications"],
            ["payments", "Payments"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === id ? "bg-rph-raised text-rph-fg shadow-sm" : "text-rph-fg-secondary hover:text-rph-fg"
            }`}
            onClick={() => {
              setError(null);
              setMessage(null);
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p> : null}

      {tab === "notifications" ? (
        <section className="rph-card space-y-5 p-4 sm:p-5">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
              Expiry notification lead times
            </h2>
            <p className="rph-meta mt-1">
              How many days before a document or licence expires should the team be notified. Defaults: MOT and tax{" "}
              {DEFAULT_NOTIFY_MOT_DAYS} days, PHV/Taxi licence {DEFAULT_NOTIFY_PHV_LICENCE_DAYS} days.
            </p>
          </div>

          {!loaded ? (
            <p className="rph-muted text-sm">Loading…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="MOT"
                hint="Days before MOT expiry"
                value={form.notify_mot_days_before}
                disabled={!canManage || busy}
                onChange={(n) => setForm((p) => ({ ...p, notify_mot_days_before: n }))}
              />
              <Field
                label="Tax"
                hint="Days before tax expiry"
                value={form.notify_tax_days_before}
                disabled={!canManage || busy}
                onChange={(n) => setForm((p) => ({ ...p, notify_tax_days_before: n }))}
              />
              <Field
                label="PHV/Taxi licence"
                hint="Days before licence expiry"
                value={form.notify_phv_licence_days_before}
                disabled={!canManage || busy}
                onChange={(n) => setForm((p) => ({ ...p, notify_phv_licence_days_before: n }))}
              />
            </div>
          )}

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rph-btn-primary" disabled={busy || !loaded} onClick={saveNotifications}>
                {busy && overlay?.phase === "pending" ? "Saving…" : "Save changes"}
              </button>
            </div>
          ) : (
            <p className="rph-meta">Only owners and admins can change these settings.</p>
          )}
        </section>
      ) : null}

      {tab === "payments" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rph-card space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Payment methods</h2>
              <p className="rph-meta mt-1">How expenses can be paid (Cash, Card, Bank transfer, …).</p>
            </div>
            {!paymentsLoaded ? (
              <p className="rph-muted text-sm">Loading…</p>
            ) : (
              <ul className="divide-y divide-rph-border">
                {methods.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <input
                      className="rph-input min-w-0 flex-1"
                      defaultValue={m.name}
                      disabled={!canManage || busy || !m.is_active}
                      onBlur={(e) => renameMethod(m, e.target.value)}
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        m.is_active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-rph-chrome text-rph-fg-muted"
                      }`}
                    >
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
                    {canManage ? (
                      <button type="button" className="rph-btn-ghost h-8 px-2 text-xs" disabled={busy} onClick={() => toggleMethod(m)}>
                        {m.is_active ? "Deactivate" : "Activate"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="rph-input flex-1"
                  placeholder="New method name"
                  value={newMethodName}
                  disabled={busy}
                  onChange={(e) => setNewMethodName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addMethod();
                  }}
                />
                <button type="button" className="rph-btn-primary" disabled={busy || !newMethodName.trim()} onClick={addMethod}>
                  Add method
                </button>
              </div>
            ) : (
              <p className="rph-meta">Only owners and admins can change payment settings.</p>
            )}
          </section>

          <section className="rph-card space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Payment accounts</h2>
              <p className="rph-meta mt-1">Accounts money comes from (Barclays Business, Petty cash, …).</p>
            </div>
            {!paymentsLoaded ? (
              <p className="rph-muted text-sm">Loading…</p>
            ) : !accounts.length ? (
              <p className="rph-muted text-sm">No accounts yet. Add at least one before logging maintenance.</p>
            ) : (
              <ul className="divide-y divide-rph-border">
                {accounts.map((a) => (
                  <li key={a.id} className="space-y-1 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="rph-input min-w-0 flex-1"
                        defaultValue={a.name}
                        disabled={!canManage || busy || !a.is_active}
                        onBlur={(e) => renameAccount(a, e.target.value)}
                      />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          a.is_active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-rph-chrome text-rph-fg-muted"
                        }`}
                      >
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                      {canManage ? (
                        <button
                          type="button"
                          className="rph-btn-ghost h-8 px-2 text-xs"
                          disabled={busy}
                          onClick={() => toggleAccount(a)}
                        >
                          {a.is_active ? "Deactivate" : "Activate"}
                        </button>
                      ) : null}
                    </div>
                    {a.notes ? <p className="text-xs text-rph-fg-muted">{a.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="space-y-2">
                <input
                  className="rph-input w-full"
                  placeholder="New account name"
                  value={newAccountName}
                  disabled={busy}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
                <input
                  className="rph-input w-full"
                  placeholder="Notes (optional)"
                  value={newAccountNotes}
                  disabled={busy}
                  onChange={(e) => setNewAccountNotes(e.target.value)}
                />
                <button
                  type="button"
                  className="rph-btn-primary"
                  disabled={busy || !newAccountName.trim()}
                  onClick={addAccount}
                >
                  Add account
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      <input
        type="number"
        min={0}
        max={365}
        step={1}
        className="rph-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="block text-xs text-rph-fg-muted">{hint}</span>
    </label>
  );
}
