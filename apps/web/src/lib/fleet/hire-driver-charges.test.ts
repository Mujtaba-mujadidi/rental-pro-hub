import { describe, expect, it } from "vitest";
import {
  buildDriverChargeDraftsFromCheckinDamages,
  isStaffManualChargeMutable,
  mapDriverChargeLineItemFromDb,
  mapDriverChargeLineItemsFromDb,
  outstandingExtraChargesGbp,
  partitionBalancePaymentsForIncome,
  realisedDriverChargeIncomeGbp,
  sumDriverChargeIncomeByTypeGbp,
  sumDriverChargeIncomeGbp,
} from "./hire-driver-charges";

describe("sumDriverChargeIncomeGbp", () => {
  it("counts paid_now immediately and skips waived and unpaid extras", () => {
    expect(
      sumDriverChargeIncomeGbp([
        { chargeType: "administration", amountGbp: 50, resolution: "paid_now" },
        { chargeType: "damage", amountGbp: 30, resolution: "add_to_balance" },
        { chargeType: "other", amountGbp: 20, resolution: "waived" },
      ]),
    ).toBe(50);
  });

  it("counts extra-charge receipts against unpaid add_to_balance", () => {
    expect(
      sumDriverChargeIncomeGbp(
        [
          { chargeType: "administration", amountGbp: 50, resolution: "paid_now" },
          { chargeType: "damage", amountGbp: 30, resolution: "add_to_balance" },
        ],
        [{ amountGbp: 70, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      ),
    ).toBe(70);
  });

  it("counts unpaid extras once the hire is settled", () => {
    expect(
      sumDriverChargeIncomeGbp(
        [{ chargeType: "damage", amountGbp: 100, resolution: "add_to_balance" }],
        [],
        { hireSettled: true },
      ),
    ).toBe(100);
  });
});

describe("sumDriverChargeIncomeByTypeGbp", () => {
  it("groups realised income by charge type", () => {
    expect(
      sumDriverChargeIncomeByTypeGbp(
        [
          { chargeType: "damage", amountGbp: 50, resolution: "paid_now" },
          { chargeType: "damage", amountGbp: 25, resolution: "add_to_balance" },
          { chargeType: "administration", amountGbp: 15, resolution: "add_to_balance" },
        ],
        [{ amountGbp: 70, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      ),
    ).toEqual({ damage: 62.5, administration: 7.5 });
  });
});

describe("realisedDriverChargeIncomeGbp", () => {
  it("does not let paid_now receipts realise add_to_balance extras", () => {
    expect(
      realisedDriverChargeIncomeGbp({
        charges: [
          { chargeType: "damage", amountGbp: 40, resolution: "paid_now" },
          { chargeType: "administration", amountGbp: 50, resolution: "add_to_balance" },
        ],
        receipts: [{ amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      }).totalGbp,
    ).toBe(40);
  });

  it("caps extra-charge receipts at billed add_to_balance", () => {
    expect(
      realisedDriverChargeIncomeGbp({
        charges: [{ chargeType: "other", amountGbp: 25, resolution: "add_to_balance" }],
        receipts: [{ amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      }).totalGbp,
    ).toBe(25);
  });
});

describe("partitionBalancePaymentsForIncome", () => {
  it("separates driver_charge payments from settlement", () => {
    const payments = [
      { amountGbp: 100, direction: "received_from_driver", paymentCategory: "settlement" },
      { amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" },
      { amountGbp: 20, direction: "received_from_driver" },
    ];
    const { settlementPayments, driverChargePayments } = partitionBalancePaymentsForIncome(payments);
    expect(settlementPayments).toHaveLength(2);
    expect(driverChargePayments).toHaveLength(1);
    expect(driverChargePayments[0]?.amountGbp).toBe(40);
  });
});

describe("buildDriverChargeDraftsFromCheckinDamages", () => {
  it("builds drafts for new check-in damages with charges", () => {
    const drafts = buildDriverChargeDraftsFromCheckinDamages([
      {
        id: "d1",
        panelId: "front_bumper",
        panelLabel: "Front bumper",
        damageType: "scratch",
        severity: "minor",
        checkoutDamageId: null,
        chargeGbp: 75,
        chargeResolution: "add_to_balance",
      },
      {
        id: "d2",
        panelId: "rear_door",
        damageType: "dent",
        severity: "moderate",
        checkoutDamageId: "checkout-1",
        chargeGbp: 100,
        chargeResolution: "paid_now",
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      chargeType: "damage",
      amountGbp: 75,
      resolution: "add_to_balance",
      sourceKind: "checkin_inspection_damage",
      sourceId: "d1",
    });
  });
});

describe("mapDriverChargeLineItemFromDb", () => {
  it("maps valid rows and rejects unknown types", () => {
    const mapped = mapDriverChargeLineItemFromDb({
      id: "li-1",
      hire_group_id: "g1",
      charge_type: "damage",
      amount_gbp: "45.50",
      resolution: "paid_now",
      source_kind: "checkin_inspection_damage",
      source_id: "d1",
      description: "Front bumper",
      created_at: "2026-07-28T12:00:00Z",
    });
    expect(mapped).toMatchObject({
      id: "li-1",
      hireGroupId: "g1",
      chargeType: "damage",
      amountGbp: 45.5,
      resolution: "paid_now",
    });

    expect(
      mapDriverChargeLineItemFromDb({
        id: "li-2",
        hire_group_id: "g1",
        charge_type: "unknown_type",
        amount_gbp: 10,
        resolution: "paid_now",
        source_kind: "checkin_inspection_damage",
      }),
    ).toBeNull();
  });

  it("maps arrays via mapDriverChargeLineItemsFromDb", () => {
    const items = mapDriverChargeLineItemsFromDb([
      {
        id: "li-1",
        hire_group_id: "g1",
        charge_type: "damage",
        amount_gbp: 10,
        resolution: "add_to_balance",
        source_kind: "checkin_inspection_damage",
      },
      {
        id: "li-2",
        hire_group_id: "g1",
        charge_type: "invalid",
        amount_gbp: 10,
        resolution: "add_to_balance",
        source_kind: "checkin_inspection_damage",
      },
    ]);
    expect(items).toHaveLength(1);
  });
});

describe("outstandingExtraChargesGbp", () => {
  it("nets add_to_balance charges against extra-charge receipts", () => {
    expect(
      outstandingExtraChargesGbp(
        [
          {
            amountGbp: 80,
            resolution: "add_to_balance",
          },
          {
            amountGbp: 20,
            resolution: "add_to_balance",
          },
        ],
        [{ amountGbp: 30, direction: "received_from_driver", paymentCategory: "driver_charge" }],
      ),
    ).toBe(70);
  });

  it("does not let check-in paid_now receipts reduce extra charges", () => {
    expect(
      outstandingExtraChargesGbp(
        [
          { amountGbp: 50, resolution: "add_to_balance" },
          { amountGbp: 40, resolution: "paid_now" },
        ],
        [
          { amountGbp: 40, direction: "received_from_driver", paymentCategory: "driver_charge" },
          { amountGbp: 10, direction: "received_from_driver", paymentCategory: "driver_charge" },
        ],
      ),
    ).toBe(40);
  });

  it("ignores settlement receipts when computing extra-charge outstanding", () => {
    expect(
      outstandingExtraChargesGbp(
        [{ amountGbp: 25, resolution: "add_to_balance" }],
        [{ amountGbp: 25, direction: "received_from_driver", paymentCategory: "settlement" }],
      ),
    ).toBe(25);
  });
});

describe("isStaffManualChargeMutable", () => {
  it("allows staff-manual lines without a linked payment", () => {
    expect(isStaffManualChargeMutable({ sourceKind: "staff_manual", balancePaymentId: null })).toBe(
      true,
    );
    expect(
      isStaffManualChargeMutable({
        sourceKind: "checkin_inspection_damage",
        balancePaymentId: null,
      }),
    ).toBe(false);
    expect(
      isStaffManualChargeMutable({ sourceKind: "staff_manual", balancePaymentId: "pay-1" }),
    ).toBe(false);
  });
});
