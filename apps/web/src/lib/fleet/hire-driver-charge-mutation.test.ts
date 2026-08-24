import { describe, expect, it } from "vitest";
import {
  parseStaffManualChargeFields,
  parseStaffManualChargeResolution,
  staffManualChargeMutationBlock,
  staffManualExtraChargeEditBlock,
} from "./hire-driver-charge-mutation";

describe("staffManualChargeMutationBlock", () => {
  it("denies viewers without rentals.write", () => {
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: false,
        hireStatus: "active",
        settlementDirection: null,
        action: "add",
      }),
    ).toBe("You do not have permission.");
  });

  it("denies draft and cancelled hires", () => {
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "draft",
        settlementDirection: null,
        action: "add",
      }),
    ).toMatch(/active or ended/);
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "cancelled",
        settlementDirection: null,
        action: "add",
      }),
    ).toMatch(/active or ended/);
  });

  it("denies settled ended hires", () => {
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "terminated",
        settlementDirection: "settled",
        action: "add",
      }),
    ).toMatch(/settled/);
  });

  it("allows add on active and open ended hires", () => {
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "active",
        settlementDirection: null,
        action: "add",
      }),
    ).toBeNull();
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "terminated",
        settlementDirection: "driver_owes_company",
        action: "add",
      }),
    ).toBeNull();
  });

  it("blocks amend/void of check-in damage and linked payments", () => {
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "active",
        settlementDirection: null,
        action: "amend",
        sourceKind: "checkin_inspection_damage",
        balancePaymentId: null,
      }),
    ).toMatch(/Check-in damage/);
    expect(
      staffManualChargeMutationBlock({
        canWriteRentals: true,
        hireStatus: "active",
        settlementDirection: null,
        action: "void",
        sourceKind: "staff_manual",
        balancePaymentId: "pay-1",
      }),
    ).toMatch(/tied to a recorded payment/);
  });
});

describe("parseStaffManualChargeFields", () => {
  it("requires amount, type, date, description, and amend reason", () => {
    expect(
      parseStaffManualChargeFields({
        amountGbp: 25,
        chargeType: "damage",
        chargedOnYmd: "2026-08-17",
        description: "Admin fee",
        requireReason: false,
      }).ok,
    ).toBe(true);

    expect(
      parseStaffManualChargeFields({
        amountGbp: 0,
        chargeType: "damage",
        chargedOnYmd: "2026-08-17",
        description: "Admin fee",
        requireReason: false,
      }).ok,
    ).toBe(false);

    expect(
      parseStaffManualChargeFields({
        amountGbp: 25,
        chargeType: "invalid_type",
        chargedOnYmd: "2026-08-17",
        description: "Admin fee",
        requireReason: false,
      }).ok,
    ).toBe(false);

    expect(
      parseStaffManualChargeFields({
        amountGbp: 25,
        chargeType: "other",
        chargedOnYmd: "2026-08-17",
        description: "Admin fee",
        requireReason: true,
        reason: "   ",
      }).ok,
    ).toBe(false);

    expect(
      parseStaffManualChargeFields({
        amountGbp: 25,
        chargeType: "rent",
        chargedOnYmd: "2026-08-17",
        description: "Extra rent",
        requireReason: false,
      }).ok,
    ).toBe(false);

    expect(
      parseStaffManualChargeFields({
        amountGbp: 25,
        chargeType: "deposit",
        chargedOnYmd: "2026-08-17",
        description: "Deposit top-up",
        requireReason: false,
      }).ok,
    ).toBe(false);
  });
});

describe("staffManualExtraChargeEditBlock", () => {
  it("blocks edit when a payment is pending approval", () => {
    expect(
      staffManualExtraChargeEditBlock({ paidGbp: 0, paymentPendingApproval: true }),
    ).toMatch(/pending approval/i);
  });

  it("blocks edit when the charge already has approved paid money", () => {
    expect(
      staffManualExtraChargeEditBlock({ paidGbp: 40, paymentPendingApproval: false }),
    ).toMatch(/approved payment/i);
  });

  it("allows edit when unpaid and not pending", () => {
    expect(
      staffManualExtraChargeEditBlock({ paidGbp: 0, paymentPendingApproval: false }),
    ).toBeNull();
  });
});

describe("parseStaffManualChargeResolution", () => {
  it("accepts add_to_balance and paid_now only", () => {
    expect(parseStaffManualChargeResolution("add_to_balance")).toBe("add_to_balance");
    expect(parseStaffManualChargeResolution("paid_now")).toBe("paid_now");
    expect(parseStaffManualChargeResolution("waived")).toBeNull();
  });
});
