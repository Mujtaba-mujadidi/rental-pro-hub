import { describe, expect, it } from "vitest";
import {
  allocateExtraChargePaymentAcrossRows,
  allocateExtraChargeReceiptsToLines,
  buildExtraChargePaymentTableRows,
  buildExtraChargePaymentTableRowsFromWorkspace,
  extraChargeSubmitBlock,
  resolveOpenExtraChargePayment,
} from "./hire-driver-charge-payment";
import type { HireDriverChargeLineItemRow } from "./hire-driver-charges";

function charge(
  partial: Partial<HireDriverChargeLineItemRow> & Pick<HireDriverChargeLineItemRow, "id" | "amountGbp">,
): HireDriverChargeLineItemRow {
  return {
    hireGroupId: "g1",
    chargeType: "administration",
    resolution: "add_to_balance",
    sourceKind: "staff_manual",
    ...partial,
  };
}

describe("resolveOpenExtraChargePayment", () => {
  it("returns the latest submitted payment that has not been reviewed", () => {
    const open = resolveOpenExtraChargePayment([
      {
        eventType: "driver_charge_payment_submitted",
        createdAt: "2026-08-17T10:00:00.000Z",
        metadata: { submissionId: "s1", amountGbp: 40, paymentReference: "REF-1" },
      },
      {
        eventType: "driver_charge_payment_approved",
        createdAt: "2026-08-17T11:00:00.000Z",
        metadata: { submissionId: "s1", amountGbp: 40 },
      },
      {
        eventType: "driver_charge_payment_submitted",
        createdAt: "2026-08-17T12:00:00.000Z",
        metadata: { submissionId: "s2", amountGbp: 25 },
      },
    ]);
    expect(open).toMatchObject({ submissionId: "s2", amountGbp: 25 });
  });

  it("returns null after rejection", () => {
    expect(
      resolveOpenExtraChargePayment([
        {
          eventType: "driver_charge_payment_submitted",
          createdAt: "2026-08-17T10:00:00.000Z",
          metadata: { submissionId: "s1", amountGbp: 40 },
        },
        {
          eventType: "driver_charge_payment_rejected",
          createdAt: "2026-08-17T11:00:00.000Z",
          metadata: { submissionId: "s1", amountGbp: 40 },
        },
      ]),
    ).toBeNull();
  });
});

describe("allocateExtraChargePaymentAcrossRows", () => {
  it("allocates FIFO across outstanding extra charges including partial cover", () => {
    const result = allocateExtraChargePaymentAcrossRows(35, [
      {
        id: "damage",
        periodLabel: "Damage",
        chargeTypeLabel: "Damage",
        description: "Bumper scuff",
        balanceGbp: 30,
        status: "due",
      },
      {
        id: "admin",
        periodLabel: "Administration",
        chargeTypeLabel: "Administration",
        description: null,
        balanceGbp: 40,
        status: "due",
      },
    ]);
    expect(result.allocations.map((line) => line.rowId)).toEqual(["damage", "admin"]);
    expect(result.allocations[0]).toMatchObject({
      allocatedGbp: 30,
      fullyAllocated: true,
      label: "Damage · Bumper scuff",
    });
    expect(result.allocations[1]).toMatchObject({
      allocatedGbp: 5,
      fullyAllocated: false,
      rowBalanceAfterGbp: 35,
    });
    expect(result.unallocatedGbp).toBe(0);
  });

  it("skips paid, waived and pending extra-charge rows", () => {
    const result = allocateExtraChargePaymentAcrossRows(20, [
      {
        id: "paid",
        periodLabel: "Damage",
        chargeTypeLabel: "Damage",
        description: null,
        balanceGbp: 0,
        status: "paid",
      },
      {
        id: "pending",
        periodLabel: "Administration",
        chargeTypeLabel: "Administration",
        description: null,
        balanceGbp: 20,
        status: "pending_approval",
      },
      {
        id: "due",
        periodLabel: "Damage",
        chargeTypeLabel: "Damage",
        description: "Door dent",
        balanceGbp: 25,
        status: "due",
      },
    ]);
    expect(result.allocations.map((line) => line.rowId)).toEqual(["due"]);
    expect(result.allocations[0]?.allocatedGbp).toBe(20);
  });
});

describe("allocateExtraChargeReceiptsToLines", () => {
  it("fills paid_now in full and pours remaining receipts FIFO", () => {
    const paid = allocateExtraChargeReceiptsToLines(
      [
        charge({ id: "now", amountGbp: 20, resolution: "paid_now", chargedOn: "2026-08-10" }),
        charge({ id: "a", amountGbp: 30, chargedOn: "2026-08-11" }),
        charge({ id: "b", amountGbp: 40, chargedOn: "2026-08-12" }),
      ],
      35,
    );
    expect(paid.get("now")).toBe(20);
    expect(paid.get("a")).toBe(30);
    expect(paid.get("b")).toBe(5);
  });
});

describe("buildExtraChargePaymentTableRows", () => {
  it("marks remaining unpaid extras as pending when a submission is open", () => {
    const rows = buildExtraChargePaymentTableRows({
      charges: [charge({ id: "a", amountGbp: 40, chargedOn: "2026-08-11" })],
      receipts: [],
      pendingAmountGbp: 40,
    });
    expect(rows[0]).toMatchObject({
      paidGbp: 0,
      balanceGbp: 40,
      status: "pending_approval",
      statusLabel: "Pending approval",
    });
  });

  it("shows remaining balance and partially paid when a receipt covers only part of a charge", () => {
    const rows = buildExtraChargePaymentTableRows({
      charges: [charge({ id: "a", amountGbp: 40, chargedOn: "2026-08-11" })],
      receipts: [{ amountGbp: 15, direction: "received_from_driver", paymentCategory: "driver_charge" }],
    });
    expect(rows[0]).toMatchObject({
      paidGbp: 15,
      balanceGbp: 25,
      status: "partially_paid",
      statusLabel: "Partially paid",
    });
  });
});

describe("extraChargeSubmitBlock", () => {
  it("blocks a second submit while one is pending", () => {
    expect(
      extraChargeSubmitBlock({
        outstandingGbp: 40,
        pending: { submissionId: "s1", amountGbp: 20, paymentReference: null, submittedAt: "2026-08-17T12:00:00.000Z" },
        amountGbp: 20,
      }),
    ).toMatch(/already pending/i);
  });

  it("blocks amounts above outstanding extras", () => {
    expect(
      extraChargeSubmitBlock({ outstandingGbp: 20, pending: null, amountGbp: 25 }),
    ).toMatch(/exceeds/i);
  });

  it("blocks a zero or invalid amount", () => {
    expect(extraChargeSubmitBlock({ outstandingGbp: 20, pending: null, amountGbp: 0 })).toMatch(/valid/i);
  });
});

describe("buildExtraChargePaymentTableRowsFromWorkspace", () => {
  it("marks remaining unpaid extras as pending from the workspace outstanding", () => {
    const rows = buildExtraChargePaymentTableRowsFromWorkspace({
      hireGroupId: "g1",
      items: [
        {
          id: "a",
          chargeType: "administration",
          amountGbp: 40,
          resolution: "add_to_balance",
          sourceKind: "staff_manual",
          description: "Admin fee",
          chargedOn: "2026-08-11",
          createdAt: "2026-08-11T10:00:00.000Z",
        },
      ],
      outstandingGbp: 40,
      pendingAmountGbp: 40,
    });
    expect(rows[0]).toMatchObject({
      paidGbp: 0,
      balanceGbp: 40,
      status: "pending_approval",
      statusLabel: "Pending approval",
    });
  });

  it("shows voided charges with zero charged/balance and a void adjustment", () => {
    const rows = buildExtraChargePaymentTableRows({
      charges: [
        charge({
          id: "v1",
          amountGbp: 35,
          resolution: "voided",
          chargedOn: "2026-08-12",
        }),
      ],
      receipts: [],
      allowMutate: true,
    });
    expect(rows[0]).toMatchObject({
      dueGbp: 35,
      adjustmentGbp: 35,
      chargedGbp: 0,
      paidGbp: 0,
      balanceGbp: 0,
      status: "voided",
      statusLabel: "Voided",
      canMutate: false,
    });
  });
});
