/** Shared purchase event form (add vehicle + financials). */

import { paymentMethodRequiresAccount, type PaymentAccountRow, type PaymentMethodRow } from "@/lib/fleet/maintenance";
import type { VehicleOwnershipEventRow } from "@/lib/fleet/vehicles";

export type PurchaseEventForm = {
  occurred_on: string;
  amount_gbp: string;
  counterparty: string;
  payment_method_id: string;
  payment_account_id: string;
  payment_reference: string;
  notes: string;
};

export function emptyPurchaseForm(
  methods: Pick<PaymentMethodRow, "id" | "is_active">[],
  accounts: Pick<PaymentAccountRow, "id" | "is_active">[],
): PurchaseEventForm {
  const activeMethods = methods.filter((m) => m.is_active);
  const activeAccounts = accounts.filter((a) => a.is_active);
  return {
    occurred_on: new Date().toISOString().slice(0, 10),
    amount_gbp: "",
    counterparty: "",
    payment_method_id: activeMethods[0]?.id ?? "",
    payment_account_id: activeAccounts[0]?.id ?? "",
    payment_reference: "",
    notes: "",
  };
}

export function purchaseFormFromEvent(
  purchase: Pick<
    VehicleOwnershipEventRow,
    | "occurred_on"
    | "amount_gbp"
    | "counterparty"
    | "payment_method_id"
    | "payment_account_id"
    | "payment_reference"
    | "notes"
  >,
  methods: Pick<PaymentMethodRow, "id" | "is_active">[],
  accounts: Pick<PaymentAccountRow, "id" | "is_active">[],
): PurchaseEventForm {
  const base = emptyPurchaseForm(methods, accounts);
  return {
    ...base,
    occurred_on: purchase.occurred_on?.slice(0, 10) ?? base.occurred_on,
    amount_gbp: String(purchase.amount_gbp),
    counterparty: purchase.counterparty ?? "",
    payment_method_id: purchase.payment_method_id ?? base.payment_method_id,
    payment_account_id: purchase.payment_account_id ?? base.payment_account_id,
    payment_reference: purchase.payment_reference ?? "",
    notes: purchase.notes ?? "",
  };
}

export function purchaseFormsEqual(a: PurchaseEventForm, b: PurchaseEventForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when user entered a purchase amount to save on vehicle create. */
export function shouldSavePurchase(form: PurchaseEventForm): boolean {
  return Boolean(form.amount_gbp.trim());
}

export function validatePurchaseEventForm(
  form: PurchaseEventForm,
  method: Pick<PaymentMethodRow, "name" | "requires_account"> | null,
): string | null {
  if (!form.occurred_on.trim()) return "Enter a purchase date.";
  if (!form.amount_gbp.trim()) return "Enter a purchase amount.";
  const amount = Number.parseFloat(form.amount_gbp);
  if (!Number.isFinite(amount) || amount < 0) return "Amount must be a non-negative number.";
  if (form.payment_method_id && paymentMethodRequiresAccount(method) && !form.payment_account_id) {
    return "Payment account is required for this method.";
  }
  return null;
}
