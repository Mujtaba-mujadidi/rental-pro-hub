import { describe, expect, it } from "vitest";
import {
  allocateExtraChargePaymentAcrossRows,
  allocateExtraChargeReceiptPaymentsToLines,
  allocateExtraChargeReceiptsToLines,
  planExtraChargePaidAmendment,
  resolveExtraChargeReceiptAllocationSlices,
  buildExtraChargePaymentTableRows,
  buildExtraChargePaymentTableRowsFromWorkspace,
  outstandingExtraChargesFromTimedPaymentsGbp,
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

describe("allocateExtraChargeReceiptPaymentsToLines", () => {
  it("returns one slice per payment when two receipts pay the same charge", () => {
    const slices = allocateExtraChargeReceiptPaymentsToLines(
      [charge({ id: "c1", amountGbp: 50, chargedOn: "2026-08-11", createdAt: "2026-08-11T09:00:00.000Z" })],
      [
        { id: "p1", amountGbp: 20, paidAt: "2026-08-17T10:00:00.000Z" },
        { id: "p2", amountGbp: 30, paidAt: "2026-08-17T11:00:00.000Z" },
      ],
    );
    expect(slices).toEqual([
      { paymentId: "p1", chargeLineItemId: "c1", allocatedGbp: 20 },
      { paymentId: "p2", chargeLineItemId: "c1", allocatedGbp: 30 },
    ]);
  });

  it("does not allocate a payment onto a charge posted after the payment", () => {
    const slices = allocateExtraChargeReceiptPaymentsToLines(
      [
        charge({
          id: "early",
          amountGbp: 30,
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T10:00:00.000Z",
        }),
        charge({
          id: "late",
          amountGbp: 100,
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T19:20:00.000Z",
        }),
      ],
      [
        { id: "p60", amountGbp: 60, paidAt: "2026-08-23T13:00:00.000Z" },
        { id: "p10", amountGbp: 10, paidAt: "2026-08-23T19:25:00.000Z" },
      ],
    );
    expect(slices).toEqual([
      { paymentId: "p60", chargeLineItemId: "early", allocatedGbp: 30 },
      { paymentId: "p10", chargeLineItemId: "late", allocatedGbp: 10 },
    ]);
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

  it("pours by creation order when charges share the same chargedOn date (D03)", () => {
    const paid = allocateExtraChargeReceiptsToLines(
      [
        charge({
          id: "pcn",
          amountGbp: 30,
          chargedOn: "2026-08-24",
          createdAt: "2026-08-24T11:00:00.000Z",
        }),
        charge({
          id: "pco",
          amountGbp: 100,
          chargedOn: "2026-08-24",
          createdAt: "2026-08-24T10:00:00.000Z",
        }),
      ],
      40,
    );
    expect(paid.get("pco")).toBe(40);
    expect(paid.get("pcn")).toBe(0);
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
      canEdit: false,
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

  it("does not re-apply paid_now cash onto a later add_to_balance charge", () => {
    const rows = buildExtraChargePaymentTableRowsFromWorkspace({
      hireGroupId: "g1",
      items: [
        {
          id: "admin",
          chargeType: "administration",
          amountGbp: 30,
          resolution: "paid_now",
          sourceKind: "staff_manual",
          description: "Admin fee",
          chargedOn: "2026-08-10",
          createdAt: "2026-08-10T10:00:00.000Z",
        },
        {
          id: "damage",
          chargeType: "damage",
          amountGbp: 100,
          resolution: "add_to_balance",
          sourceKind: "staff_manual",
          description: null,
          chargedOn: "2026-08-11",
          createdAt: "2026-08-11T10:00:00.000Z",
        },
      ],
      // Outstanding extras only — paid_now is already collected.
      outstandingGbp: 100,
    });
    expect(rows.find((row) => row.id === "admin")).toMatchObject({
      paidGbp: 30,
      balanceGbp: 0,
      status: "paid",
    });
    expect(rows.find((row) => row.id === "damage")).toMatchObject({
      paidGbp: 0,
      balanceGbp: 100,
      status: "due",
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

describe("buildExtraChargePaymentTableRows with real receipts", () => {
  it("keeps paid_now receipt off later add_to_balance lines", () => {
    const rows = buildExtraChargePaymentTableRows({
      charges: [
        charge({
          id: "admin",
          amountGbp: 30,
          resolution: "paid_now",
          chargedOn: "2026-08-10",
          createdAt: "2026-08-10T10:00:00.000Z",
          balancePaymentId: "p-now",
        }),
        charge({
          id: "damage",
          amountGbp: 100,
          chargedOn: "2026-08-11",
          createdAt: "2026-08-11T10:00:00.000Z",
        }),
      ],
      receipts: [
        { amountGbp: 30, direction: "received_from_driver", paymentCategory: "driver_charge" },
      ],
      timedPayments: [
        { id: "p-now", amountGbp: 30, paidAt: "2026-08-10T12:00:00.000Z" },
      ],
    });
    expect(rows.find((row) => row.id === "admin")?.paidGbp).toBe(30);
    expect(rows.find((row) => row.id === "damage")?.paidGbp).toBe(0);
  });

  it("does not mark a later charge paid from cash taken before it existed", () => {
    const rows = buildExtraChargePaymentTableRows({
      charges: [
        charge({
          id: "pcn",
          amountGbp: 30,
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T10:00:00.000Z",
        }),
        charge({
          id: "pco",
          amountGbp: 100,
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T19:20:00.000Z",
        }),
      ],
      receipts: [],
      timedPayments: [
        { id: "p60", amountGbp: 60, paidAt: "2026-08-23T13:00:00.000Z" },
        { id: "p10", amountGbp: 10, paidAt: "2026-08-23T19:25:00.000Z" },
      ],
    });
    expect(rows.find((row) => row.id === "pcn")).toMatchObject({
      paidGbp: 30,
      balanceGbp: 0,
      status: "paid",
    });
    expect(rows.find((row) => row.id === "pco")).toMatchObject({
      paidGbp: 10,
      balanceGbp: 90,
      status: "partially_paid",
    });
    expect(
      outstandingExtraChargesFromTimedPaymentsGbp({
        charges: [
          charge({
            id: "pcn",
            amountGbp: 30,
            chargedOn: "2026-08-23",
            createdAt: "2026-08-23T10:00:00.000Z",
          }),
          charge({
            id: "pco",
            amountGbp: 100,
            chargedOn: "2026-08-23",
            createdAt: "2026-08-23T19:20:00.000Z",
          }),
        ],
        payments: [
          { id: "p60", amountGbp: 60, paidAt: "2026-08-23T13:00:00.000Z" },
          { id: "p10", amountGbp: 10, paidAt: "2026-08-23T19:25:00.000Z" },
        ],
      }),
    ).toBe(90);
  });
});

describe("planExtraChargePaidAmendment", () => {
  it("reduces paid on one charge without moving cash onto a later charge", () => {
    const charges = [
      charge({
        id: "pco",
        amountGbp: 100,
        chargedOn: "2026-08-24",
        createdAt: "2026-08-24T10:00:00.000Z",
      }),
      charge({
        id: "pcn",
        amountGbp: 30,
        chargedOn: "2026-08-24",
        createdAt: "2026-08-24T11:00:00.000Z",
      }),
    ];
    const payments = [{ id: "pay40", amountGbp: 40, paidAt: "2026-08-24T12:00:00.000Z" }];
    const allocationEvents = [
      {
        eventType: "driver_charge_payment_approved",
        metadata: {
          balancePaymentId: "pay40",
          allocations: [{ chargeLineItemId: "pco", amountGbp: 40 }],
        },
      },
    ];

    const plan = planExtraChargePaidAmendment({
      chargeLineItemId: "pco",
      newPaidGbp: 0,
      charges,
      payments,
      allocationEvents,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.previousPaidGbp).toBe(40);
    expect(plan.newPaidGbp).toBe(0);
    expect(plan.paymentUpdates).toEqual([
      {
        paymentId: "pay40",
        previousAmountGbp: 40,
        newAmountGbp: 0,
        allocations: [],
      },
    ]);
  });
});

describe("resolveExtraChargeReceiptAllocationSlices amended metadata", () => {
  it("prefers amended allocations over the original approve split (D03 defence)", () => {
    const charges = [
      charge({
        id: "pco",
        amountGbp: 100,
        chargedOn: "2026-08-24",
        createdAt: "2026-08-24T10:00:00.000Z",
      }),
      charge({
        id: "pcn",
        amountGbp: 30,
        chargedOn: "2026-08-24",
        createdAt: "2026-08-24T11:00:00.000Z",
      }),
    ];
    const slices = resolveExtraChargeReceiptAllocationSlices({
      charges,
      payments: [{ id: "pay40", amountGbp: 40, paidAt: "2026-08-24T12:00:00.000Z" }],
      allocationEvents: [
        {
          eventType: "driver_charge_payment_approved",
          metadata: {
            balancePaymentId: "pay40",
            allocations: [
              { chargeLineItemId: "pcn", amountGbp: 30 },
              { chargeLineItemId: "pco", amountGbp: 10 },
            ],
          },
        },
        {
          eventType: "driver_charge_payment_amended",
          metadata: {
            balancePaymentId: "pay40",
            allocations: [{ chargeLineItemId: "pco", amountGbp: 40 }],
          },
        },
      ],
    });
    expect(slices).toEqual([
      { paymentId: "pay40", chargeLineItemId: "pco", allocatedGbp: 40 },
    ]);
  });
});

describe("extra charge canEdit", () => {
  it("canEdit is false once paid or pending", () => {
    const unpaid = buildExtraChargePaymentTableRows({
      charges: [charge({ id: "a", amountGbp: 40, chargedOn: "2026-08-11" })],
      receipts: [],
      allowMutate: true,
    });
    expect(unpaid[0]?.canEdit).toBe(true);

    const paid = buildExtraChargePaymentTableRows({
      charges: [charge({ id: "a", amountGbp: 40, chargedOn: "2026-08-11" })],
      receipts: [{ amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      allowMutate: true,
    });
    expect(paid[0]).toMatchObject({ status: "paid", canEdit: false, canMutate: true });

    const pending = buildExtraChargePaymentTableRows({
      charges: [charge({ id: "a", amountGbp: 40, chargedOn: "2026-08-11" })],
      receipts: [],
      pendingAmountGbp: 40,
      allowMutate: true,
    });
    expect(pending[0]).toMatchObject({ status: "pending_approval", canEdit: false, canMutate: true });
  });
});
