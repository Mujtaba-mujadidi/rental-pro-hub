"use client";

import { paymentMethodRequiresAccount, type PaymentAccountRow, type PaymentMethodRow } from "@/lib/fleet/maintenance";
import type { PurchaseEventForm } from "@/lib/fleet/vehicle-purchase";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}

export function VehiclePurchaseFormFields({
  form,
  onChange,
  methods,
  accounts,
  amountRequired = false,
}: {
  form: PurchaseEventForm;
  onChange: (next: PurchaseEventForm) => void;
  methods: PaymentMethodRow[];
  accounts: PaymentAccountRow[];
  /** When true, date/amount inputs are required (financials save). */
  amountRequired?: boolean;
}) {
  const activeMethods = methods.filter((m) => m.is_active);
  const activeAccounts = accounts.filter((a) => a.is_active);
  const selectedMethod = activeMethods.find((m) => m.id === form.payment_method_id) ?? null;

  function patch<K extends keyof PurchaseEventForm>(key: K, value: PurchaseEventForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Purchase date">
        <input
          type="date"
          className="rph-input"
          value={form.occurred_on}
          onChange={(e) => patch("occurred_on", e.target.value)}
          required={amountRequired}
        />
      </Field>
      <Field label="Amount (£)">
        <input
          type="number"
          min={0}
          step="0.01"
          className="rph-input"
          value={form.amount_gbp}
          onChange={(e) => patch("amount_gbp", e.target.value)}
          placeholder="e.g. 8500"
          required={amountRequired}
        />
      </Field>
      <Field label="Seller (optional)">
        <input
          className="rph-input sm:col-span-2"
          value={form.counterparty}
          onChange={(e) => patch("counterparty", e.target.value)}
          placeholder="Dealer or previous owner"
        />
      </Field>
      <Field label="Payment method (optional)">
        <select
          className="rph-input"
          value={form.payment_method_id}
          onChange={(e) => patch("payment_method_id", e.target.value)}
        >
          <option value="">—</option>
          {activeMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {paymentMethodRequiresAccount(selectedMethod) ? (
        <Field label="Payment account">
          <select
            className="rph-input"
            value={form.payment_account_id}
            onChange={(e) => patch("payment_account_id", e.target.value)}
            required={amountRequired}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Reference (optional)">
        <input
          className="rph-input"
          value={form.payment_reference}
          onChange={(e) => patch("payment_reference", e.target.value)}
        />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          className="rph-input min-h-[4rem] sm:col-span-2"
          value={form.notes}
          onChange={(e) => patch("notes", e.target.value)}
        />
      </Field>
    </div>
  );
}
