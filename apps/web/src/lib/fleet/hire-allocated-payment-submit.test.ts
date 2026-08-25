import { beforeEach, describe, expect, it, vi } from "vitest";

const recordHireDriverChargePaymentAction = vi.fn();
const submitDriverExtraChargePaymentAction = vi.fn();
const submitDriverHirePaymentAction = vi.fn();
const submitStaffHirePaymentAction = vi.fn();

vi.mock("@/app/actions/hire-driver-charges", () => ({
  recordHireDriverChargePaymentAction: (...args: unknown[]) =>
    recordHireDriverChargePaymentAction(...args),
  submitDriverExtraChargePaymentAction: (...args: unknown[]) =>
    submitDriverExtraChargePaymentAction(...args),
}));

vi.mock("@/app/actions/hire-payments", () => ({
  submitDriverHirePaymentAction: (...args: unknown[]) => submitDriverHirePaymentAction(...args),
  submitStaffHirePaymentAction: (...args: unknown[]) => submitStaffHirePaymentAction(...args),
}));

import { submitAllocatedHirePayment } from "./hire-allocated-payment-submit";

const payment = {
  amountGbp: 25,
  paymentReference: "REF-1",
  paymentMethod: "bank_transfer",
  paymentAccountId: "acc-1",
  paidOnYmd: "2026-08-19",
  notes: "note",
};

describe("submitAllocatedHirePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordHireDriverChargePaymentAction.mockResolvedValue({ ok: true });
    submitDriverExtraChargePaymentAction.mockResolvedValue({ ok: true });
    submitDriverHirePaymentAction.mockResolvedValue({ ok: true });
    submitStaffHirePaymentAction.mockResolvedValue({ ok: true });
  });

  it("records staff extra-charge payments separately from rent", async () => {
    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: false,
      payment: { ...payment, allocationKind: "extra_charges" },
    });
    expect(recordHireDriverChargePaymentAction).toHaveBeenCalledOnce();
    expect(submitStaffHirePaymentAction).not.toHaveBeenCalled();

    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: false,
      payment: { ...payment, allocationKind: "schedule" },
    });
    expect(submitStaffHirePaymentAction).toHaveBeenCalledOnce();
  });

  it("passes manual extra-charge selection through to staff and driver actions", async () => {
    const selected = ["wash-1", "admin-2"];
    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: false,
      payment: {
        ...payment,
        allocationKind: "extra_charges",
        selectedExtraChargeLineItemIds: selected,
      },
    });
    expect(recordHireDriverChargePaymentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        hireGroupId: "hire-1",
        selectedExtraChargeLineItemIds: selected,
      }),
    );

    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: true,
      payment: {
        ...payment,
        allocationKind: "extra_charges",
        selectedExtraChargeLineItemIds: selected,
      },
    });
    expect(submitDriverExtraChargePaymentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        hireGroupId: "hire-1",
        selectedExtraChargeLineItemIds: selected,
      }),
    );
  });

  it("routes driver submissions to rent or extra-charge actions", async () => {
    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: true,
      payment: { ...payment, allocationKind: "extra_charges" },
    });
    expect(submitDriverExtraChargePaymentAction).toHaveBeenCalledOnce();

    await submitAllocatedHirePayment({
      hireGroupId: "hire-1",
      asDriver: true,
      payment: { ...payment, allocationKind: "schedule" },
    });
    expect(submitDriverHirePaymentAction).toHaveBeenCalledOnce();
  });
});
