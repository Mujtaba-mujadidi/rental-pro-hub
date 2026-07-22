"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  formatUkSortCode,
  normalizeUkSortCodeForStorage,
  splitUkSortCodeParts,
} from "@/lib/payments/uk-sort-code";
import {
  createPaymentAccountAction,
  createPaymentMethodAction,
  loadPaymentSettingsAction,
  updatePaymentAccountAction,
  updatePaymentMethodAction,
} from "@/app/actions/rental-payment-settings";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import type { PaymentAccountRow, PaymentMethodRow } from "@/lib/fleet/maintenance";

type AccountDraft = {
  name: string;
  notes: string;
  payee_name: string;
  sort_code: string;
  account_number: string;
  show_to_hirer: boolean;
};

const emptyAccountDraft = (): AccountDraft => ({
  name: "",
  notes: "",
  payee_name: "",
  sort_code: "",
  account_number: "",
  show_to_hirer: false,
});

export function PaymentSettingsSection() {
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccountRow[]>([]);
  const [newMethodName, setNewMethodName] = useState("");
  const [newAccount, setNewAccount] = useState<AccountDraft>(emptyAccountDraft);
  const [showAddAccount, setShowAddAccount] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const res = await loadPaymentSettingsAction();
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setMethods(res.methods);
      setAccounts(res.accounts);
      setCanManage(res.canManage);
      setLoaded(true);
    });
  }, []);

  async function reloadPayments() {
    const res = await loadPaymentSettingsAction();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMethods(res.methods);
    setAccounts(res.accounts);
  }

  const busy = pending || overlay?.phase === "pending";

  function addMethod() {
    const name = newMethodName.trim();
    if (!name) return;
    setError(null);
    setOverlay({ phase: "pending", title: "Adding payment method…", detail: "" });
    startTransition(async () => {
      const res = await createPaymentMethodAction({ name });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not add method", detail: res.error });
        setError(res.error);
        return;
      }
      setNewMethodName("");
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment method added", detail: "" });
    });
  }

  function toggleMethod(m: PaymentMethodRow) {
    setOverlay({ phase: "pending", title: m.is_active ? "Deactivating…" : "Activating…", detail: "" });
    startTransition(async () => {
      const res = await updatePaymentMethodAction({ id: m.id, is_active: !m.is_active });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not update method", detail: res.error });
        return;
      }
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment method updated", detail: "" });
    });
  }

  function renameMethod(m: PaymentMethodRow, name: string) {
    const next = name.trim();
    if (!next || next === m.name) return;
    startTransition(async () => {
      const res = await updatePaymentMethodAction({ id: m.id, name: next });
      if (!res.ok) setError(res.error);
      else await reloadPayments();
    });
  }

  function updateAccount(
    account: PaymentAccountRow,
    patch: Partial<Omit<AccountDraft, "name">> & {
      name?: string;
      payee_name?: string | null;
      sort_code?: string | null;
      account_number?: string | null;
      notes?: string | null;
    },
  ) {
    startTransition(async () => {
      const apiPatch: Parameters<typeof updatePaymentAccountAction>[0] = { id: account.id };
      if (patch.name !== undefined) apiPatch.name = patch.name;
      if (patch.payee_name !== undefined) apiPatch.payee_name = patch.payee_name?.trim() || null;
      if (patch.sort_code !== undefined) apiPatch.sort_code = patch.sort_code;
      if (patch.account_number !== undefined) apiPatch.account_number = patch.account_number?.trim() || null;
      if (patch.notes !== undefined) apiPatch.notes = patch.notes?.trim() || null;
      if (patch.show_to_hirer !== undefined) apiPatch.show_to_hirer = patch.show_to_hirer;

      const res = await updatePaymentAccountAction(apiPatch);
      if (!res.ok) setError(res.error);
      else await reloadPayments();
    });
  }

  function toggleAccount(a: PaymentAccountRow) {
    setOverlay({ phase: "pending", title: a.is_active ? "Deactivating…" : "Activating…", detail: "" });
    startTransition(async () => {
      const res = await updatePaymentAccountAction({ id: a.id, is_active: !a.is_active });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not update account", detail: res.error });
        return;
      }
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment account updated", detail: "" });
    });
  }

  function addAccount() {
    const name = newAccount.name.trim();
    if (!name) return;
    setError(null);
    setOverlay({ phase: "pending", title: "Adding payment account…", detail: "" });
    startTransition(async () => {
      const res = await createPaymentAccountAction({
        name,
        notes: newAccount.notes,
        payee_name: newAccount.payee_name,
        sort_code: newAccount.sort_code,
        account_number: newAccount.account_number,
        show_to_hirer: newAccount.show_to_hirer,
      });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not add account", detail: res.error });
        setError(res.error);
        return;
      }
      setNewAccount(emptyAccountDraft());
      setShowAddAccount(false);
      await reloadPayments();
      setOverlay({ phase: "success", title: "Payment account added", detail: "" });
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="rph-card space-y-4 p-4 sm:p-5">
        <SectionHeader
          title="Payment methods"
          description="How expenses are paid when logging maintenance (cash, card, bank transfer, and custom methods)."
        />
        {!loaded ? (
          <p className="rph-muted text-sm">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-rph-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rph-border bg-rph-chrome/60 text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                  <th className="px-4 py-2.5">Method</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Account required</th>
                  <th className="px-4 py-2.5">Status</th>
                  {canManage ? <th className="px-4 py-2.5 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {methods.map((m) => (
                  <tr key={m.id} className="bg-rph-raised/40">
                    <td className="px-4 py-3">
                      {canManage ? (
                        <input
                          className="rph-input w-full min-w-0"
                          defaultValue={m.name}
                          disabled={busy || !m.is_active}
                          onBlur={(e) => renameMethod(m, e.target.value)}
                        />
                      ) : (
                        <span className="font-medium text-rph-fg">{m.name}</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-rph-fg-secondary sm:table-cell">
                      {m.requires_account ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={m.is_active} />
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rph-btn-ghost h-8 px-2.5 text-xs"
                          disabled={busy}
                          onClick={() => toggleMethod(m)}
                        >
                          {m.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <SettingsField label="New method" className="flex-1">
              <input
                className="rph-input w-full"
                placeholder="e.g. Company fuel card"
                value={newMethodName}
                disabled={busy}
                onChange={(e) => setNewMethodName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addMethod();
                }}
              />
            </SettingsField>
            <button
              type="button"
              className="rph-btn-primary shrink-0"
              disabled={busy || !newMethodName.trim()}
              onClick={addMethod}
            >
              Add method
            </button>
          </div>
        ) : (
          <p className="rph-meta">Only owners and admins can change payment settings.</p>
        )}
      </section>

      <section className="rph-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeader
            title="Payment accounts"
            description="Bank accounts used for maintenance spend and, optionally, rent collection shown to hirers on contracts and timesheets."
          />
          {canManage && loaded && !showAddAccount ? (
            <button
              type="button"
              className="rph-btn-primary shrink-0"
              disabled={busy}
              onClick={() => setShowAddAccount(true)}
            >
              Add account
            </button>
          ) : null}
        </div>

        {!loaded ? (
          <p className="rph-muted text-sm">Loading…</p>
        ) : !accounts.length && !showAddAccount ? (
          <div className="rounded-xl border border-dashed border-rph-border bg-rph-chrome/30 px-4 py-8 text-center">
            <p className="text-sm text-rph-fg-secondary">No payment accounts yet.</p>
            <p className="rph-meta mt-1">Add at least one before logging maintenance or assigning hire payment details.</p>
            {canManage ? (
              <button
                type="button"
                className="rph-btn-primary mt-4"
                disabled={busy}
                onClick={() => setShowAddAccount(true)}
              >
                Add first account
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <PaymentAccountCard
                key={a.id}
                account={a}
                canManage={canManage}
                busy={busy}
                onToggle={() => toggleAccount(a)}
                onUpdate={(patch) => updateAccount(a, patch)}
              />
            ))}
          </div>
        )}

        {canManage && showAddAccount ? (
          <div className="rounded-xl border border-rph-border-strong bg-rph-chrome/40 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-rph-fg">New payment account</h3>
            <p className="rph-meta mt-0.5">Enter the label and bank details together — they are stored on one account record.</p>
            <AccountFields
              className="mt-4"
              draft={newAccount}
              disabled={busy}
              onChange={(patch) => setNewAccount((prev) => ({ ...prev, ...patch }))}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rph-btn-primary"
                disabled={busy || !newAccount.name.trim()}
                onClick={addAccount}
              >
                Save account
              </button>
              <button
                type="button"
                className="rph-btn-ghost"
                disabled={busy}
                onClick={() => {
                  setShowAddAccount(false);
                  setNewAccount(emptyAccountDraft());
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">{title}</h2>
      <p className="rph-meta mt-1 max-w-3xl">{description}</p>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-rph-chrome text-rph-fg-muted"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function SettingsField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-rph-fg-muted">{hint}</span> : null}
    </label>
  );
}

function AccountFields({
  draft,
  disabled,
  onChange,
  className,
}: {
  draft: AccountDraft;
  disabled?: boolean;
  onChange: (patch: Partial<AccountDraft>) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <SettingsField label="Account label" hint="How your team recognises this account (e.g. Barclays Business).">
        <input
          className="rph-input w-full"
          placeholder="Barclays Business"
          value={draft.name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </SettingsField>

      <div className="rounded-xl border border-rph-border bg-rph-raised/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Bank details</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SettingsField label="Payee name">
            <input
              className="rph-input w-full"
              placeholder="Legal payee name"
              value={draft.payee_name}
              disabled={disabled}
              onChange={(e) => onChange({ payee_name: e.target.value })}
            />
          </SettingsField>
          <SettingsField label="Sort code">
            <SortCodeInput
              value={draft.sort_code}
              disabled={disabled}
              onChange={(sort_code) => onChange({ sort_code })}
            />
          </SettingsField>
          <SettingsField label="Account number">
            <input
              className="rph-input w-full"
              placeholder="12345678"
              value={draft.account_number}
              disabled={disabled}
              onChange={(e) => onChange({ account_number: e.target.value })}
            />
          </SettingsField>
        </div>
      </div>

      <SettingsField label="Internal notes" hint="Optional — not shown to hirers.">
        <textarea
          className="rph-input min-h-[4rem] w-full resize-y"
          placeholder="Optional notes for your team"
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </SettingsField>

      <label className="flex items-start gap-2.5 rounded-lg border border-rph-border bg-rph-chrome/30 px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.show_to_hirer}
          disabled={disabled}
          onChange={(e) => onChange({ show_to_hirer: e.target.checked })}
        />
        <span className="text-sm text-rph-fg-secondary">
          <span className="font-medium text-rph-fg">Show bank details to hirers</span>
          <span className="mt-0.5 block text-xs text-rph-fg-muted">
            Includes payee, sort code, and account number on hire contracts and timesheets.
          </span>
        </span>
      </label>
    </div>
  );
}

function PaymentAccountCard({
  account,
  canManage,
  busy,
  onToggle,
  onUpdate,
}: {
  account: PaymentAccountRow;
  canManage: boolean;
  busy: boolean;
  onToggle: () => void;
  onUpdate: (
    patch: Partial<AccountDraft> & {
      payee_name?: string | null;
      sort_code?: string | null;
      account_number?: string | null;
      notes?: string | null;
    },
  ) => void;
}) {
  const disabled = !canManage || busy || !account.is_active;
  const hasBankDetails = Boolean(account.payee_name || account.sort_code || account.account_number);

  return (
    <article
      className={`rounded-xl border p-4 sm:p-5 ${
        account.is_active
          ? "border-rph-border bg-rph-raised/40"
          : "border-rph-border/70 bg-rph-chrome/20 opacity-80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {canManage ? (
            <input
              className="rph-input w-full max-w-md font-semibold"
              defaultValue={account.name}
              disabled={disabled}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== account.name) onUpdate({ name: next });
              }}
            />
          ) : (
            <h3 className="text-base font-semibold text-rph-fg">{account.name}</h3>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {account.show_to_hirer ? (
            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              Shown to hirers
            </span>
          ) : null}
          <StatusBadge active={account.is_active} />
          {canManage ? (
            <button type="button" className="rph-btn-ghost h-8 px-2.5 text-xs" disabled={busy} onClick={onToggle}>
              {account.is_active ? "Deactivate" : "Activate"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-rph-border bg-rph-page/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Bank details</p>
          {!hasBankDetails && !canManage ? (
            <span className="text-xs text-rph-fg-muted">Not configured</span>
          ) : null}
        </div>

        {canManage ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsField label="Payee name">
              <input
                className="rph-input w-full"
                defaultValue={account.payee_name ?? ""}
                disabled={disabled}
                placeholder="Legal payee name"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (account.payee_name ?? "")) onUpdate({ payee_name: next });
                }}
              />
            </SettingsField>
            <SettingsField label="Sort code">
              <SortCodeInput
                key={account.id}
                value={account.sort_code ?? ""}
                disabled={disabled}
                onCommit={(next) => {
                  const stored = normalizeUkSortCodeForStorage(account.sort_code);
                  const committed = normalizeUkSortCodeForStorage(next);
                  if (committed !== stored) onUpdate({ sort_code: next });
                }}
              />
            </SettingsField>
            <SettingsField label="Account number">
              <input
                className="rph-input w-full"
                defaultValue={account.account_number ?? ""}
                disabled={disabled}
                placeholder="12345678"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (account.account_number ?? "")) onUpdate({ account_number: next });
                }}
              />
            </SettingsField>
          </div>
        ) : hasBankDetails ? (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Payee name" value={account.payee_name} />
            <DetailItem label="Sort code" value={formatUkSortCode(account.sort_code ?? "") || account.sort_code} />
            <DetailItem label="Account number" value={account.account_number} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-rph-fg-muted">No bank details on this account.</p>
        )}
      </div>

      {canManage ? (
        <>
          <div className="mt-3">
            <SettingsField label="Internal notes">
              <textarea
                className="rph-input min-h-[3.5rem] w-full resize-y"
                defaultValue={account.notes ?? ""}
                disabled={disabled}
                placeholder="Optional notes for your team"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (account.notes ?? "")) onUpdate({ notes: next });
                }}
              />
            </SettingsField>
          </div>
          <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-rph-border bg-rph-chrome/30 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              defaultChecked={account.show_to_hirer}
              disabled={disabled}
              onChange={(e) => onUpdate({ show_to_hirer: e.target.checked })}
            />
            <span className="text-sm text-rph-fg-secondary">
              <span className="font-medium text-rph-fg">Show bank details to hirers</span>
              <span className="mt-0.5 block text-xs text-rph-fg-muted">
                On hire contracts and timesheets when this account is selected.
              </span>
            </span>
          </label>
        </>
      ) : account.notes ? (
        <p className="mt-3 text-sm text-rph-fg-muted">{account.notes}</p>
      ) : null}
    </article>
  );
}

function SortCodeInput({
  value,
  disabled,
  onChange,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onChange?: (formatted: string) => void;
  onCommit?: (formatted: string) => void;
}) {
  const [parts, setParts] = useState(() => splitUkSortCodeParts(value));
  const part2Ref = useRef<HTMLInputElement>(null);
  const part3Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setParts(splitUkSortCodeParts(value));
  }, [value]);

  function emit(nextParts: [string, string, string]) {
    const formatted = formatUkSortCode(nextParts.join(""));
    onChange?.(formatted);
    return formatted;
  }

  function handlePartChange(index: 0 | 1 | 2, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    const next: [string, string, string] = [...parts];
    next[index] = digits;
    setParts(next);
    emit(next);
    if (digits.length === 2) {
      if (index === 0) part2Ref.current?.focus();
      if (index === 1) part3Ref.current?.focus();
    }
  }

  function handleBlur() {
    const formatted = formatUkSortCode(parts.join(""));
    setParts(splitUkSortCodeParts(formatted));
    onCommit?.(formatted);
  }

  const inputClass =
    "rph-input w-[3.25rem] text-center font-mono tabular-nums tracking-widest";

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={inputClass}
        maxLength={2}
        value={parts[0]}
        disabled={disabled}
        placeholder="00"
        aria-label="Sort code first pair"
        onChange={(e) => handlePartChange(0, e.target.value)}
        onBlur={handleBlur}
      />
      <span className="text-sm font-medium text-rph-fg-muted" aria-hidden>
        -
      </span>
      <input
        ref={part2Ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={inputClass}
        maxLength={2}
        value={parts[1]}
        disabled={disabled}
        placeholder="00"
        aria-label="Sort code second pair"
        onChange={(e) => handlePartChange(1, e.target.value)}
        onBlur={handleBlur}
      />
      <span className="text-sm font-medium text-rph-fg-muted" aria-hidden>
        -
      </span>
      <input
        ref={part3Ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={inputClass}
        maxLength={2}
        value={parts[2]}
        disabled={disabled}
        placeholder="00"
        aria-label="Sort code third pair"
        onChange={(e) => handlePartChange(2, e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-rph-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-rph-fg">{value?.trim() || "—"}</dd>
    </div>
  );
}
