import { describe, expect, it } from "vitest";
import {
  parseStaffManualChargeFields,
  parseStaffManualChargeResolution,
  staffManualChargeLockedAsHireTimePost,
  staffManualChargeMutationBlock,
  staffManualExtraChargeEditBlock,
  staffManualExtraChargeVoidBlock,
  staffPaymentPaidAtIso,
} from "./hire-driver-charge-mutation";
import { formatUkDateTime } from "@/lib/datetime/uk";

describe("staffPaymentPaidAtIso", () => {
  it("uses the selected UK day with the current London clock time", () => {
    // 2026-09-09 02:10 BST = 01:10 UTC
    const now = new Date("2026-09-09T01:10:00.000Z");
    const iso = staffPaymentPaidAtIso("2026-09-09", now);
    expect(iso).toBe("2026-09-09T01:10:00.000Z");
    expect(formatUkDateTime(iso)).toBe("09/09/2026, 02:10");
  });

  it("keeps a backdated calendar day while applying the recording clock", () => {
    const now = new Date("2026-09-09T01:10:00.000Z");
    const iso = staffPaymentPaidAtIso("2026-08-28", now);
    expect(iso).toBe("2026-08-28T01:10:00.000Z");
    expect(formatUkDateTime(iso)).toBe("28/08/2026, 02:10");
  });
});

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
    ).toMatch(/Amend the paid amount to £0 before editing/i);
  });

  it("allows edit when unpaid and not pending", () => {
    expect(
      staffManualExtraChargeEditBlock({ paidGbp: 0, paymentPendingApproval: false }),
    ).toBeNull();
  });
});

describe("staffManualExtraChargeVoidBlock", () => {
  it("blocks void when a payment is pending approval", () => {
    expect(
      staffManualExtraChargeVoidBlock({ paidGbp: 0, paymentPendingApproval: true }),
    ).toMatch(/pending approval/i);
  });

  it("blocks void when the charge already has approved paid money", () => {
    expect(
      staffManualExtraChargeVoidBlock({ paidGbp: 30, paymentPendingApproval: false }),
    ).toMatch(/Amend the paid amount to £0 before voiding/i);
  });

  it("allows void when unpaid and not pending", () => {
    expect(
      staffManualExtraChargeVoidBlock({ paidGbp: 0, paymentPendingApproval: false }),
    ).toBeNull();
  });
});

describe("staffManualChargeLockedAsHireTimePost", () => {
  it("locks staff-manual charges dated before contract end", () => {
    expect(
      staffManualChargeLockedAsHireTimePost({
        sourceKind: "staff_manual",
        chargedOn: "2026-08-01",
        createdAt: "2026-08-01T10:00:00.000Z",
        contractEndedYmd: "2026-09-01",
      }),
    ).toBe(true);
  });

  it("allows staff-manual adjustments after contract end", () => {
    expect(
      staffManualChargeLockedAsHireTimePost({
        sourceKind: "staff_manual",
        chargedOn: "2026-09-02",
        createdAt: "2026-09-02T10:00:00.000Z",
        contractEndedYmd: "2026-09-01",
      }),
    ).toBe(false);
  });

  it("does not apply to return inspection charges", () => {
    expect(
      staffManualChargeLockedAsHireTimePost({
        sourceKind: "checkin_inspection_accessory",
        chargedOn: "2026-08-01",
        createdAt: "2026-08-01T10:00:00.000Z",
        contractEndedYmd: "2026-09-01",
      }),
    ).toBe(false);
  });
});

describe("parseStaffManualChargeResolution", () => {
  it("accepts add_to_balance and paid_now only", () => {
    expect(parseStaffManualChargeResolution("add_to_balance")).toBe("add_to_balance");
    expect(parseStaffManualChargeResolution("paid_now")).toBe("paid_now");
    expect(parseStaffManualChargeResolution("waived")).toBeNull();
  });
});
