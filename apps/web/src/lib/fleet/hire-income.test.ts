import { describe, expect, it } from "vitest";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  computeVehicleHireIncomeGbp,
  depositAppliedToRentIncomeGbp,
  depositRetentionIncomeGbp,
  endedHireRentIncomeGbp,
  hireContractEndYmd,
  hireIncomeAccrualYmd,
  isPostEndPrepaidHireIncomeRow,
  sumApprovedHireIncomeGbp,
  sumHireCollectionsFromDriverGbp,
  sumHireRefundsToDriverGbp,
  sumHireSettlementWriteOffsGbp,
  supplementalSettlementRentCollectionsGbp,
  type HireIncomeGroupContext,
} from "@/lib/fleet/hire-income";

function groupContext(
  contractEndedYmd: string | null,
  overrides?: Partial<HireIncomeGroupContext>,
): Map<string, HireIncomeGroupContext> {
  return new Map([
    [
      "g1",
      {
        contractEndedYmd,
        rentCadence: "weekly",
        rentBillingMode: "actual",
        settlementWriteOffGbp: 0,
        depositDisposition: null,
        depositRefundAmountGbp: null,
        depositGbp: 0,
        signedRentBalanceGbp: null,
        ...overrides,
      },
    ],
  ]);
}

describe("hireContractEndYmd", () => {
  it("uses terminated_at then falls back to ended_at", () => {
    expect(
      hireContractEndYmd({
        status: "completed",
        terminatedAt: null,
        endedAt: "2026-07-27T22:56:44Z",
      }),
    ).toBe("2026-07-27");
    expect(
      hireContractEndYmd({
        status: "terminated",
        terminatedAt: "2026-07-27T20:00:00Z",
        endedAt: "2026-07-28T10:00:00Z",
      }),
    ).toBe("2026-07-27");
  });
});

describe("sumApprovedHireIncomeGbp", () => {
  it("sums paid rows including approved amounts before status flips", () => {
    const total = sumApprovedHireIncomeGbp([
      { paymentStatus: "approved", approvedAmountGbp: null, baseAmountGbp: 250, discountTotalGbp: 50 },
      { paymentStatus: "approved", approvedAmountGbp: 200, baseAmountGbp: 250, discountTotalGbp: 0 },
      { paymentStatus: "not_received", approvedAmountGbp: null, baseAmountGbp: 250, discountTotalGbp: 0 },
      { paymentStatus: "pending_approval", approvedAmountGbp: 75, baseAmountGbp: 100, discountTotalGbp: 0 },
    ]);
    expect(total).toBe(475);
  });
});

describe("sumHireRefundsToDriverGbp", () => {
  it("sums only paid_to_driver ledger rows", () => {
    expect(
      sumHireRefundsToDriverGbp([
        { amountGbp: 100, direction: "paid_to_driver" },
        { amountGbp: 50, direction: "received_from_driver" },
        { amountGbp: 25, direction: "paid_to_driver" },
      ]),
    ).toBe(125);
  });
});

describe("sumHireCollectionsFromDriverGbp", () => {
  it("sums only received_from_driver ledger rows", () => {
    expect(
      sumHireCollectionsFromDriverGbp([
        { amountGbp: 80, direction: "received_from_driver" },
        { amountGbp: 40, direction: "paid_to_driver" },
      ]),
    ).toBe(80);
  });
});

describe("supplementalSettlementRentCollectionsGbp", () => {
  it("only counts collections up to uncollected accrued rent", () => {
    expect(
      supplementalSettlementRentCollectionsGbp({
        accruedRentDueGbp: 500,
        scheduleRentIncomeGbp: 200,
        collectionsFromDriverGbp: 330,
      }),
    ).toBe(300);
    expect(
      supplementalSettlementRentCollectionsGbp({
        accruedRentDueGbp: 100,
        scheduleRentIncomeGbp: 100,
        collectionsFromDriverGbp: 330,
      }),
    ).toBe(0);
  });
});

describe("sumHireSettlementWriteOffsGbp", () => {
  it("sums positive write-off amounts", () => {
    expect(sumHireSettlementWriteOffsGbp([{ settlementWriteOffGbp: 30 }, { settlementWriteOffGbp: 20 }])).toBe(50);
  });
});

describe("isPostEndPrepaidHireIncomeRow", () => {
  it("flags approved rent after contract end", () => {
    expect(
      isPostEndPrepaidHireIncomeRow(
        {
          hireGroupId: "g1",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
        "2026-07-20",
      ),
    ).toBe(true);
  });

  it("ignores deposit rows", () => {
    expect(
      isPostEndPrepaidHireIncomeRow(
        {
          hireGroupId: "g1",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          rowKind: "deposit",
          paymentStatus: "approved",
          approvedAmountGbp: 500,
          baseAmountGbp: 500,
          discountTotalGbp: 0,
        },
        "2026-07-20",
      ),
    ).toBe(false);
  });
});

describe("computeVehicleHireIncomeGbp", () => {
  const todayYmd = "2026-07-28";

  it("nets schedule rent, supplemental collections, refunds, and write-offs without double-counting", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-07-08",
          periodEnd: "2026-07-14",
          rowKind: "rent",
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          baseAmountGbp: 400,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-01",
          rowKind: "deposit",
          paymentStatus: "approved",
          approvedAmountGbp: 500,
          baseAmountGbp: 500,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [
        { amountGbp: 50, direction: "paid_to_driver" },
        { amountGbp: 330, direction: "received_from_driver" },
      ],
      groupContextByGroupId: groupContext("2026-07-20", { settlementWriteOffGbp: 10 }),
      todayYmd,
    });

    expect(result.grossApprovedGbp).toBe(100);
    expect(result.accruedRentDueGbp).toBe(500);
    expect(result.supplementalCollectionsGbp).toBe(330);
    expect(result.postEndPrepaidExcludedGbp).toBe(0);
    expect(result.refundsToDriverGbp).toBe(50);
    expect(result.collectionsFromDriverGbp).toBe(330);
    expect(result.settlementWriteOffsGbp).toBe(10);
    expect(result.netIncomeGbp).toBe(420);
  });

  it("counts in-contract rent for ended hires without subtracting prepaid refunds (FJ67YMD shape)", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-23",
          periodEnd: "2026-07-29",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 70,
          baseAmountGbp: 110,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-07-30",
          periodEnd: "2026-08-05",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 110,
          baseAmountGbp: 110,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-08-06",
          periodEnd: "2026-08-12",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 110,
          baseAmountGbp: 110,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-08-13",
          periodEnd: "2026-08-19",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 110,
          baseAmountGbp: 110,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [
        { amountGbp: 30, direction: "paid_to_driver" },
        { amountGbp: 100, direction: "paid_to_driver" },
        { amountGbp: 200, direction: "paid_to_driver" },
      ],
      groupContextByGroupId: groupContext("2026-07-27", { rentBillingMode: "end_of_period" }),
      todayYmd: "2026-07-28",
    });

    expect(result.grossApprovedGbp).toBe(70);
    expect(result.postEndPrepaidExcludedGbp).toBe(330);
    expect(result.refundsToDriverGbp).toBe(330);
    expect(result.netIncomeGbp).toBe(70);
  });

  it("caps ended-hire rent income at accrued due when overpaid", () => {
    expect(
      endedHireRentIncomeGbp({ accruedRentPaidGbp: 250, accruedRentDueGbp: 178.57 }),
    ).toBeCloseTo(178.57, 2);
  });

  it("scopes supplemental settlement collections per hire group", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-23",
          periodEnd: "2026-07-29",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 70,
          baseAmountGbp: 70,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g2",
          periodStart: "2026-07-28",
          periodEnd: "2026-08-03",
          rowKind: "rent",
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          baseAmountGbp: 130,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [
        { hireGroupId: "g1", amountGbp: 130, direction: "received_from_driver" },
      ],
      groupContextByGroupId: new Map([
        [
          "g1",
          {
            contractEndedYmd: "2026-07-27",
            rentCadence: "weekly",
            rentBillingMode: "end_of_period",
            settlementWriteOffGbp: 0,
            depositDisposition: "refund_full",
            depositRefundAmountGbp: null,
            depositGbp: 300,
            signedRentBalanceGbp: -330,
          },
        ],
        [
          "g2",
          {
            contractEndedYmd: "2026-07-28",
            rentCadence: "weekly",
            rentBillingMode: "end_of_period",
            settlementWriteOffGbp: 0,
            depositDisposition: "refund_full",
            depositRefundAmountGbp: null,
            depositGbp: 200,
            signedRentBalanceGbp: 130,
          },
        ],
      ]),
      todayYmd: "2026-07-28",
    });

    expect(result.supplementalCollectionsGbp).toBe(0);
    expect(result.netIncomeGbp).toBe(70);
  });

  it("does not double-count settlement collections already reflected on the schedule", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 500,
          baseAmountGbp: 500,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [{ amountGbp: 330, direction: "received_from_driver" }],
      groupContextByGroupId: groupContext("2026-07-20"),
      todayYmd,
    });

    expect(result.grossApprovedGbp).toBe(500);
    expect(result.supplementalCollectionsGbp).toBe(0);
    expect(result.netIncomeGbp).toBe(500);
  });

  it("counts approved amounts even when workflow status is still pending approval", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "pending_approval",
          approvedAmountGbp: 250,
          baseAmountGbp: 250,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [],
      groupContextByGroupId: groupContext(null),
      todayYmd,
    });

    expect(result.grossApprovedGbp).toBe(250);
    expect(result.netIncomeGbp).toBe(250);
  });

  it("excludes future rent on active hires using todayYmd", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-09-01",
          periodEnd: "2026-09-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 200,
          baseAmountGbp: 200,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [],
      groupContextByGroupId: groupContext(null),
      todayYmd,
    });

    expect(result.grossApprovedGbp).toBe(100);
    expect(result.netIncomeGbp).toBe(100);
  });

  it("prorates the terminating period using actual billing mode", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 250,
          baseAmountGbp: 250,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [],
      groupContextByGroupId: groupContext("2026-07-05", { rentBillingMode: "actual" }),
      todayYmd,
    });

    expect(result.grossApprovedGbp).toBeCloseTo(178.57, 2);
    expect(result.netIncomeGbp).toBeCloseTo(178.57, 2);
  });

  it("adds forfeited or partially retained deposit to hire income", () => {
    const baseRows = [
      {
        hireGroupId: "g1",
        periodStart: "2026-07-23",
        periodEnd: "2026-07-29",
        rowKind: "rent",
        paymentStatus: "approved",
        approvedAmountGbp: 70,
        baseAmountGbp: 110,
        discountTotalGbp: 0,
      },
    ];

    const forfeited = computeVehicleHireIncomeGbp({
      scheduleRows: baseRows,
      balancePayments: [],
      groupContextByGroupId: groupContext("2026-07-27", {
        rentBillingMode: "end_of_period",
        depositDisposition: "forfeit",
        depositGbp: 300,
      }),
      todayYmd,
    });
    expect(forfeited.depositRetentionGbp).toBe(300);
    expect(forfeited.netIncomeGbp).toBe(370);

    const partial = computeVehicleHireIncomeGbp({
      scheduleRows: baseRows,
      balancePayments: [],
      groupContextByGroupId: groupContext("2026-07-27", {
        rentBillingMode: "end_of_period",
        depositDisposition: "refund_partial",
        depositGbp: 300,
        depositRefundAmountGbp: 100,
      }),
      todayYmd,
    });
    expect(partial.depositRetentionGbp).toBe(200);
    expect(partial.netIncomeGbp).toBe(270);

    const pending = computeVehicleHireIncomeGbp({
      scheduleRows: baseRows,
      balancePayments: [],
      groupContextByGroupId: groupContext("2026-07-27", {
        rentBillingMode: "end_of_period",
        depositDisposition: "hold_pending",
        depositGbp: 300,
      }),
      todayYmd,
    });
    expect(pending.depositRetentionGbp).toBe(0);
    expect(pending.netIncomeGbp).toBe(70);
  });

  it("does not double-count deposit applied to rent when schedule shows inflated paid amounts", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-29",
          periodEnd: "2026-08-04",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-08-05",
          periodEnd: "2026-08-08",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [{ amountGbp: 100, direction: "paid_to_driver", paymentCategory: "settlement" }],
      driverChargeLineItems: [
        {
          chargeType: "damage",
          amountGbp: 100,
          resolution: "add_to_balance",
          sourceKind: "checkin_inspection_damage",
        },
      ],
      groupContextByGroupId: groupContext("2026-08-08", {
        rentBillingMode: "actual",
        depositDisposition: "apply_to_balance",
        depositGbp: 500,
        signedRentBalanceGbp: 57.14,
        accruedRentPaidGbp: 100,
        accruedRentDueGbp: 157.14,
        settlementSettled: true,
      }),
      todayYmd: "2026-08-08",
    });

    expect(result.depositRetentionGbp).toBe(0);
    expect(result.grossApprovedGbp).toBe(257.14);
    expect(result.netIncomeGbp).toBe(257.14);
    expect(result.driverChargeIncomeGbp).toBe(100);
  });

  it("includes realised driver charges in gross and net income", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [
        { amountGbp: 50, direction: "received_from_driver", paymentCategory: "driver_charge" },
        { amountGbp: 25, direction: "received_from_driver", paymentCategory: "driver_charge" },
      ],
      driverChargeLineItems: [
        {
          chargeType: "damage",
          amountGbp: 50,
          resolution: "paid_now",
          sourceKind: "checkin_inspection_damage",
        },
        {
          chargeType: "damage",
          amountGbp: 25,
          resolution: "add_to_balance",
          sourceKind: "checkin_inspection_damage",
        },
      ],
      groupContextByGroupId: groupContext("2026-07-20"),
      todayYmd,
    });

    expect(result.driverChargeIncomeGbp).toBe(75);
    expect(result.driverChargeIncomeByTypeGbp).toEqual({ damage: 75 });
    expect(result.grossApprovedGbp).toBe(175);
    expect(result.netIncomeGbp).toBe(175);
  });

  it("does not book unpaid extras on an open hire as vehicle profit", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [],
      driverChargeLineItems: [
        {
          hireGroupId: "g1",
          chargeType: "administration",
          amountGbp: 40,
          resolution: "add_to_balance",
          sourceKind: "staff_manual",
        },
      ],
      groupContextByGroupId: groupContext(null),
      todayYmd,
    });

    expect(result.driverChargeIncomeGbp).toBe(0);
    expect(result.netIncomeGbp).toBe(100);
  });

  it("excludes driver_charge balance payments from settlement collections", () => {
    const result = computeVehicleHireIncomeGbp({
      scheduleRows: [
        {
          hireGroupId: "g1",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          rowKind: "rent",
          paymentStatus: "approved",
          approvedAmountGbp: 100,
          baseAmountGbp: 100,
          discountTotalGbp: 0,
        },
        {
          hireGroupId: "g1",
          periodStart: "2026-07-08",
          periodEnd: "2026-07-14",
          rowKind: "rent",
          paymentStatus: "not_received",
          approvedAmountGbp: null,
          baseAmountGbp: 400,
          discountTotalGbp: 0,
        },
      ],
      balancePayments: [
        { amountGbp: 50, direction: "received_from_driver", paymentCategory: "settlement" },
        { amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" },
      ],
      driverChargeLineItems: [
        {
          chargeType: "damage",
          amountGbp: 40,
          resolution: "paid_now",
          sourceKind: "checkin_inspection_damage",
        },
      ],
      groupContextByGroupId: groupContext("2026-07-20"),
      todayYmd,
    });

    expect(result.collectionsFromDriverGbp).toBe(50);
    expect(result.supplementalCollectionsGbp).toBe(50);
    expect(result.driverChargeIncomeGbp).toBe(40);
    expect(result.netIncomeGbp).toBe(190);
  });
});

describe("depositRetentionIncomeGbp", () => {
  it("recognises forfeit, partial refund, and apply-to-balance retention", () => {
    expect(
      depositRetentionIncomeGbp({
        depositDisposition: "forfeit",
        depositGbp: 300,
      }),
    ).toBe(300);

    expect(
      depositRetentionIncomeGbp({
        depositDisposition: "refund_partial",
        depositGbp: 300,
        depositRefundAmountGbp: 120,
      }),
    ).toBe(180);

    expect(
      depositRetentionIncomeGbp({
        depositDisposition: "apply_to_balance",
        depositGbp: 300,
        signedRentBalanceGbp: 70,
      }),
    ).toBe(0);

    expect(
      depositAppliedToRentIncomeGbp({
        depositDisposition: "apply_to_balance",
        depositGbp: 300,
        signedRentBalanceGbp: 70,
        recognizedRentIncomeGbp: 100,
        accruedRentDueGbp: 170,
      }),
    ).toBe(70);

    expect(
      depositRetentionIncomeGbp({
        depositDisposition: "hold_pending",
        depositGbp: 300,
      }),
    ).toBe(0);

    expect(
      depositRetentionIncomeGbp({
        depositDisposition: "refund_full",
        depositGbp: 300,
      }),
    ).toBe(0);
  });
});

describe("hireIncomeAccrualYmd", () => {
  it("uses contract end when set", () => {
    expect(hireIncomeAccrualYmd("2026-07-20", ukTodayYmd())).toBe("2026-07-20");
  });
});
