"use client";

import { useEffect, useState, useTransition } from "react";
import {
  loadCompanyNotificationSettingsAction,
  saveCompanyNotificationSettingsAction,
} from "@/app/actions/rental-settings";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { HirePermissionLetterSettingsSection } from "@/app/(main)/rental/settings/hire-permission-letter-settings-section";
import { HireTermsSettingsSection } from "@/app/(main)/rental/settings/hire-terms-settings-section";
import { PaymentSettingsSection } from "@/app/(main)/rental/settings/payment-settings-section";
import {
  DEFAULT_NOTIFY_CONTRACT_EXPIRY_DAYS,
  DEFAULT_NOTIFY_MOT_DAYS,
  DEFAULT_NOTIFY_PHV_LICENCE_DAYS,
  DEFAULT_NOTIFY_TAX_DAYS,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
type SettingsTab = "notifications" | "payments" | "hire_terms" | "permission_letter";

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
    notify_contract_expiry_days_before: DEFAULT_NOTIFY_CONTRACT_EXPIRY_DAYS,
  });
  const [loaded, setLoaded] = useState(false);

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
            ["hire_terms", "Hire terms"],
            ["permission_letter", "Permission letter"],
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Field
                label="Hire contracts"
                hint="Days before contract end date"
                value={form.notify_contract_expiry_days_before}
                disabled={!canManage || busy}
                onChange={(n) => setForm((p) => ({ ...p, notify_contract_expiry_days_before: n }))}
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

      {tab === "payments" ? <PaymentSettingsSection /> : null}

      {tab === "hire_terms" ? <HireTermsSettingsSection /> : null}
      {tab === "permission_letter" ? <HirePermissionLetterSettingsSection /> : null}

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
