import { describe, expect, it } from "vitest";
import {
  parseStaffManualChargeFields,
  staffManualChargeMutationBlock,
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

  it("blocks amend/delete of check-in damage and linked payments", () => {
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
        action: "delete",
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
        chargeType: "rent",
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
  });
});
