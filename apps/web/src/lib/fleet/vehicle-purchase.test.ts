import { describe, expect, it } from "vitest";
import {
  emptyPurchaseForm,
  purchaseFormsEqual,
  shouldSavePurchase,
  validatePurchaseEventForm,
} from "@/lib/fleet/vehicle-purchase";

describe("shouldSavePurchase", () => {
  it("is false when amount empty", () => {
    expect(shouldSavePurchase(emptyPurchaseForm([], []))).toBe(false);
  });

  it("is true when amount set", () => {
    expect(shouldSavePurchase({ ...emptyPurchaseForm([], []), amount_gbp: "5000" })).toBe(true);
  });
});

describe("validatePurchaseEventForm", () => {
  const method = { name: "Card", requires_account: true };

  it("requires date and amount", () => {
    expect(validatePurchaseEventForm(emptyPurchaseForm([], []), null)).toBe("Enter a purchase amount.");
  });

  it("requires account for non-cash methods", () => {
    const form = {
      ...emptyPurchaseForm([{ id: "m1", is_active: true }], []),
      amount_gbp: "100",
      payment_method_id: "m1",
      payment_account_id: "",
    };
    expect(validatePurchaseEventForm(form, method)).toBe("Payment account is required for this method.");
  });

  it("passes valid form", () => {
    const form = {
      occurred_on: "2026-01-15",
      amount_gbp: "8500",
      counterparty: "Dealer",
      payment_method_id: "",
      payment_account_id: "",
      payment_reference: "",
      notes: "",
    };
    expect(validatePurchaseEventForm(form, null)).toBeNull();
  });
});

describe("purchaseFormsEqual", () => {
  it("compares serialized forms", () => {
    const a = emptyPurchaseForm([], []);
    const b = emptyPurchaseForm([], []);
    expect(purchaseFormsEqual(a, b)).toBe(true);
    expect(purchaseFormsEqual(a, { ...a, amount_gbp: "1" })).toBe(false);
  });
});
