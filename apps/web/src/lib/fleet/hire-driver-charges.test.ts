import { describe, expect, it } from "vitest";
import {
  buildDriverChargeDraftsFromCheckinDamages,
  mapDriverChargeLineItemFromDb,
  mapDriverChargeLineItemsFromDb,
  partitionBalancePaymentsForIncome,
  sumDriverChargeIncomeByTypeGbp,
  sumDriverChargeIncomeGbp,
} from "./hire-driver-charges";

describe("sumDriverChargeIncomeGbp", () => {
  it("counts paid_now and add_to_balance, skips waived", () => {
    expect(
      sumDriverChargeIncomeGbp([
        { amountGbp: 50, resolution: "paid_now" },
        { amountGbp: 30, resolution: "add_to_balance" },
        { amountGbp: 20, resolution: "waived" },
      ]),
    ).toBe(80);
  });
});

describe("sumDriverChargeIncomeByTypeGbp", () => {
  it("groups income by charge type", () => {
    expect(
      sumDriverChargeIncomeByTypeGbp([
        { chargeType: "damage", amountGbp: 50, resolution: "paid_now" },
        { chargeType: "damage", amountGbp: 25, resolution: "add_to_balance" },
      ]),
    ).toEqual({ damage: 75 });
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
