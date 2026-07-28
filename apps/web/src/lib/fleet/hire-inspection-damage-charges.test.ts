import { describe, expect, it } from "vitest";
import {
  applyDamageChargesToSettlementBalance,
  summarizeInspectionDamageCharges,
  validateInspectionDamageCharges,
} from "@/lib/fleet/hire-inspection-damage-charges";
import { seedCheckinDamagesFromCheckout } from "@/lib/fleet/hire-inspection-draft-damages";

describe("seedCheckinDamagesFromCheckout", () => {
  it("copies checkout damages missing from check-in draft", () => {
    const seeded = seedCheckinDamagesFromCheckout(
      [],
      [
        {
          id: "checkout-1",
          panelId: "front_bumper",
          damageType: "scratch",
          severity: "minor",
          notes: null,
          diagramView: null,
          pinX: null,
          pinY: null,
        },
      ],
    );
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.checkoutDamageId).toBe("checkout-1");
    expect(seeded[0]?.id.startsWith("local:")).toBe(true);
  });
});

describe("summarizeInspectionDamageCharges", () => {
  it("totals only new damages with amounts", () => {
    const summary = summarizeInspectionDamageCharges([
      {
        id: "1",
        checkoutDamageId: "c1",
        chargeGbp: 50,
        chargeResolution: "paid_now",
      },
      {
        id: "2",
        checkoutDamageId: null,
        chargeGbp: 80,
        chargeResolution: "paid_now",
      },
      {
        id: "3",
        checkoutDamageId: null,
        chargeGbp: 120,
        chargeResolution: "add_to_balance",
      },
    ]);
    expect(summary.paidNowGbp).toBe(80);
    expect(summary.addToBalanceGbp).toBe(120);
  });
});

describe("validateInspectionDamageCharges", () => {
  it("requires resolution when amount is set", () => {
    expect(
      validateInspectionDamageCharges([
        {
          id: "1",
          checkoutDamageId: null,
          chargeGbp: 50,
          chargeResolution: null,
        },
      ]),
    ).toMatch(/Choose how to resolve/);
  });
});

describe("applyDamageChargesToSettlementBalance", () => {
  it("adds damage charges to driver balance", () => {
    const next = applyDamageChargesToSettlementBalance({
      settlementBalanceDirection: "driver_owes_company",
      settlementBalanceGbp: 100,
      addToBalanceGbp: 75,
    });
    expect(next.settlementBalanceDirection).toBe("driver_owes_company");
    expect(next.settlementBalanceGbp).toBe(175);
  });

  it("creates driver balance from settled when adding charges", () => {
    const next = applyDamageChargesToSettlementBalance({
      settlementBalanceDirection: "settled",
      settlementBalanceGbp: 0,
      addToBalanceGbp: 120,
    });
    expect(next.settlementBalanceDirection).toBe("driver_owes_company");
    expect(next.settlementBalanceGbp).toBe(120);
  });
});
