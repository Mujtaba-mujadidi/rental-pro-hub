import { describe, expect, it } from "vitest";
import {
  areReturnChargesReady,
  buildReturnChargeLineItemDrafts,
  dedupePostedAccessoryChargeRows,
  hasFuelReturnShortfall,
  isReturnDamageResolved,
  isUniqueChargeSourceConflict,
  listMissingAccessoryItems,
  listUnpostedReturnChargeAddToBalanceRows,
  missingPostedReturnChargeSettlementGbp,
  parseHireReturnAccessoryKeyFromCharge,
  returnChargeSettlementDeltaGbp,
  validateOptionalReturnCharge,
  validateReturnDamageCharges,
} from "./hire-return-charges";
import { EMPTY_HIRE_INSPECTION_ACCESSORIES } from "./hire-inspection-accessories";

describe("hire-return-charges", () => {
  it("lists accessories missing at return", () => {
    expect(
      listMissingAccessoryItems(
        { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: true, hasChargingCable: true },
        { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: false, hasChargingCable: true },
      ),
    ).toEqual(["hasSpareTyre"]);
  });

  it("detects fuel shortfall only when return fuel is lower", () => {
    expect(hasFuelReturnShortfall(75, 25)).toBe(true);
    expect(hasFuelReturnShortfall(25, 75)).toBe(false);
    expect(hasFuelReturnShortfall(null, 25)).toBe(false);
  });

  it("requires each new damage to be resolved before apply", () => {
    expect(
      validateReturnDamageCharges([
        {
          id: "d1",
          checkoutDamageId: null,
          chargeGbp: null,
          chargeResolution: null,
        },
      ]),
    ).toMatch(/resolve/i);
    expect(
      validateReturnDamageCharges([
        {
          id: "d1",
          checkoutDamageId: null,
          chargeGbp: null,
          chargeResolution: "waived",
        },
      ]),
    ).toBeNull();
  });

  it("validates optional fuel charge only when enabled", () => {
    expect(
      validateOptionalReturnCharge({
        enabled: false,
        amountGbp: null,
        chargeResolution: null,
      }),
    ).toBeNull();
    expect(
      validateOptionalReturnCharge({
        enabled: true,
        amountGbp: null,
        chargeResolution: "add_to_balance",
      }),
    ).toMatch(/amount/i);
  });

  it("blocks finalise when new damages exist but return charges were not saved", () => {
    expect(
      areReturnChargesReady({
        newDamages: [
          {
            id: "d1",
            checkoutDamageId: null,
            chargeGbp: null,
            chargeResolution: "waived",
          },
        ],
        returnChargesDraftSavedAt: null,
        hasReturnChargeWork: true,
      }),
    ).toBe(false);
    expect(
      areReturnChargesReady({
        newDamages: [
          {
            id: "d1",
            checkoutDamageId: null,
            chargeGbp: null,
            chargeResolution: "waived",
          },
        ],
        returnChargesDraftSavedAt: "2026-08-30T12:00:00.000Z",
        hasReturnChargeWork: true,
      }),
    ).toBe(true);
  });

  it("treats review_later as resolved without an amount", () => {
    expect(
      validateReturnDamageCharges([
        {
          id: "d1",
          checkoutDamageId: null,
          chargeGbp: null,
          chargeResolution: "review_later",
        },
      ]),
    ).toBeNull();
    expect(
      isReturnDamageResolved({
        id: "d1",
        checkoutDamageId: null,
        chargeGbp: null,
        chargeResolution: "review_later",
      }),
    ).toBe(true);
    expect(
      areReturnChargesReady({
        newDamages: [
          {
            id: "d1",
            checkoutDamageId: null,
            chargeGbp: null,
            chargeResolution: "review_later",
          },
        ],
        returnChargesDraftSavedAt: "2026-08-31T12:00:00.000Z",
        hasReturnChargeWork: true,
      }),
    ).toBe(true);
  });

  it("allows optional fuel review without an amount", () => {
    expect(
      validateOptionalReturnCharge({
        enabled: true,
        amountGbp: null,
        chargeResolution: "review_later",
      }),
    ).toBeNull();
  });

  it("does not build line items for review_later", () => {
    const drafts = buildReturnChargeLineItemDrafts({
      damages: [
        {
          id: "d1",
          panelId: "front_bumper",
          damageType: "scratch",
          severity: "minor",
          checkoutDamageId: null,
          chargeGbp: null,
          chargeResolution: "review_later",
        },
      ],
      fuel: {
        enabled: true,
        amountGbp: null,
        chargeResolution: "review_later",
        checkoutFuelLevel: 80,
        checkinFuelLevel: 40,
        checkinInspectionId: "insp-1",
      },
    });
    expect(drafts).toHaveLength(0);
  });

  it("rejects paid_now on return charges", () => {
    expect(
      validateReturnDamageCharges([
        {
          id: "d1",
          checkoutDamageId: null,
          chargeGbp: 50,
          chargeResolution: "paid_now",
        },
      ]),
    ).toMatch(/hire balance/i);
    expect(
      validateOptionalReturnCharge({
        enabled: true,
        amountGbp: 20,
        chargeResolution: "paid_now",
      }),
    ).toMatch(/hire balance/i);
  });

  it("builds fuel and accessory drafts onto the hire balance only", () => {
    const drafts = buildReturnChargeLineItemDrafts({
      damages: [],
      fuel: {
        enabled: true,
        amountGbp: 35,
        chargeResolution: "add_to_balance",
        checkoutFuelLevel: 80,
        checkinFuelLevel: 40,
        checkinInspectionId: "insp-1",
      },
      accessories: [
        {
          key: "hasSpareTyre",
          enabled: true,
          amountGbp: 120,
          chargeResolution: "add_to_balance",
        },
      ],
      checkinInspectionId: "insp-1",
    });
    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.resolution === "add_to_balance")).toBe(true);
    expect(drafts[0]).toMatchObject({
      sourceKind: "checkin_inspection_fuel",
      amountGbp: 35,
      description: expect.stringContaining("Fuel difference"),
    });
    expect(drafts[1]).toMatchObject({
      sourceKind: "checkin_inspection_accessory",
      sourceId: "hasSpareTyre",
      description: "Missing Spare tyre",
      amountGbp: 120,
    });
  });

  it("ignores paid_now when building return charge line items", () => {
    expect(
      buildReturnChargeLineItemDrafts({
        damages: [
          {
            id: "d1",
            panelId: "front_bumper",
            damageType: "scratch",
            severity: "minor",
            checkoutDamageId: null,
            chargeGbp: 80,
            chargeResolution: "paid_now",
          },
        ],
      }),
    ).toHaveLength(0);
  });
});

describe("returnChargeSettlementDeltaGbp", () => {
  it("posts line items only when settlement already includes the return charges", () => {
    expect(
      returnChargeSettlementDeltaGbp({
        currentOpenGbp: 1050,
        rentOutstandingGbp: 600,
        extrasOutstandingGbp: 50,
        previousPostedReturnGbp: 0,
        nextPostedReturnGbp: 400,
      }),
    ).toBe(0);
  });

  it("adds return charges to settlement when they are not in the open balance yet", () => {
    expect(
      returnChargeSettlementDeltaGbp({
        currentOpenGbp: 650,
        rentOutstandingGbp: 600,
        extrasOutstandingGbp: 50,
        previousPostedReturnGbp: 0,
        nextPostedReturnGbp: 400,
      }),
    ).toBe(400);
  });

  it("applies the difference when a posted return charge amount changes", () => {
    expect(
      returnChargeSettlementDeltaGbp({
        currentOpenGbp: 1050,
        rentOutstandingGbp: 600,
        extrasOutstandingGbp: 50,
        previousPostedReturnGbp: 400,
        nextPostedReturnGbp: 500,
      }),
    ).toBe(100);
  });
});

describe("missingPostedReturnChargeSettlementGbp", () => {
  it("heals when open balance matches rent+extras but return charges are posted", () => {
    expect(
      missingPostedReturnChargeSettlementGbp({
        settlementBalanceDirection: "driver_owes_company",
        settlementBalanceGbp: 650,
        depositDisposition: "hold_pending",
        rentOutstandingGbp: 600,
        hireExtrasOutstandingGbp: 50,
        postedReturnAddToBalanceGbp: 400,
      }),
    ).toBe(400);
  });

  it("does not heal when settlement already includes return charges", () => {
    expect(
      missingPostedReturnChargeSettlementGbp({
        settlementBalanceDirection: "driver_owes_company",
        settlementBalanceGbp: 1050,
        depositDisposition: "hold_pending",
        rentOutstandingGbp: 600,
        hireExtrasOutstandingGbp: 50,
        postedReturnAddToBalanceGbp: 400,
      }),
    ).toBe(0);
  });

  it("does not heal after deposit was applied to the balance", () => {
    expect(
      missingPostedReturnChargeSettlementGbp({
        settlementBalanceDirection: "driver_owes_company",
        settlementBalanceGbp: 450,
        depositDisposition: "apply_to_balance",
        rentOutstandingGbp: 600,
        hireExtrasOutstandingGbp: 50,
        postedReturnAddToBalanceGbp: 400,
      }),
    ).toBe(0);
  });
});

describe("listUnpostedReturnChargeAddToBalanceRows", () => {
  const draft = {
    damages: [
      {
        id: "d-scratch",
        chargeGbp: 100,
        chargeResolution: "add_to_balance" as const,
      },
    ],
    fuel: { enabled: false, amountGbp: null, chargeResolution: null },
    accessories: [
      {
        key: "hasTyreKeyLocks",
        enabled: true,
        amountGbp: 100,
        chargeResolution: "add_to_balance" as const,
      },
    ],
  };

  it("lists draft add_to_balance rows that are not posted", () => {
    expect(
      listUnpostedReturnChargeAddToBalanceRows({
        draft,
        posted: [],
        damageMeta: [
          { id: "d-scratch", panelId: "rear_bonnet", damageType: "scratch" },
        ],
      }),
    ).toEqual([
      { id: "unposted-damage-d-scratch", label: "Rear Bonnet scratch", amountGbp: 100 },
      {
        id: "unposted-accessory-hasTyreKeyLocks",
        label: "Missing Tyre key / locks",
        amountGbp: 100,
      },
    ]);
  });

  it("omits rows already on the charges table", () => {
    expect(
      listUnpostedReturnChargeAddToBalanceRows({
        draft,
        posted: [
          { sourceKind: "checkin_inspection_damage", sourceId: "d-scratch" },
          {
            sourceKind: "checkin_inspection_accessory",
            sourceId: "insp-1",
            description: "Missing Tyre key / locks",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("still recognises legacy accessory source_id keys", () => {
    expect(
      listUnpostedReturnChargeAddToBalanceRows({
        draft,
        posted: [
          { sourceKind: "checkin_inspection_damage", sourceId: "d-scratch" },
          { sourceKind: "checkin_inspection_accessory", sourceId: "hasTyreKeyLocks" },
        ],
      }),
    ).toEqual([]);
  });

  it("omits unposted tyre key when description uses pending-review wording", () => {
    expect(
      listUnpostedReturnChargeAddToBalanceRows({
        draft,
        posted: [
          { sourceKind: "checkin_inspection_damage", sourceId: "d-scratch" },
          {
            sourceKind: "checkin_inspection_accessory",
            sourceId: "insp-uuid",
            description: "Missing accessory · Tyre key / locks",
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("parseHireReturnAccessoryKeyFromCharge", () => {
  it("resolves key, canonical description, and pending-review wording", () => {
    expect(
      parseHireReturnAccessoryKeyFromCharge({ sourceId: "hasTyreKeyLocks", description: null }),
    ).toBe("hasTyreKeyLocks");
    expect(
      parseHireReturnAccessoryKeyFromCharge({
        sourceId: "insp-1",
        description: "Missing Tyre key / locks",
      }),
    ).toBe("hasTyreKeyLocks");
    expect(
      parseHireReturnAccessoryKeyFromCharge({
        sourceId: "insp-1",
        description: "Missing accessory · Tyre key / locks",
      }),
    ).toBe("hasTyreKeyLocks");
  });
});

describe("dedupePostedAccessoryChargeRows", () => {
  it("keeps one tyre-key accessory row when duplicates exist", () => {
    const rows = dedupePostedAccessoryChargeRows([
      {
        id: "a1",
        sourceKind: "checkin_inspection_accessory",
        sourceId: "insp-1",
        description: "Missing Tyre key / locks",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
      {
        id: "a2",
        sourceKind: "checkin_inspection_accessory",
        sourceId: "hasTyreKeyLocks",
        description: "Missing Tyre key / locks",
        createdAt: "2026-09-01T11:00:00.000Z",
      },
      {
        id: "d1",
        sourceKind: "checkin_inspection_damage",
        sourceId: "damage-1",
        description: "Bumper · scratch · minor",
        createdAt: "2026-09-01T09:00:00.000Z",
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["d1", "a1"]);
  });

  it("keeps one damage row per source_id when duplicates exist", () => {
    const rows = dedupePostedAccessoryChargeRows([
      {
        id: "d1",
        sourceKind: "checkin_inspection_damage",
        sourceId: "damage-1",
        description: "Bumper · scratch · minor",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
      {
        id: "d2",
        sourceKind: "checkin_inspection_damage",
        sourceId: "damage-1",
        description: "Bumper · scratch · minor",
        createdAt: "2026-09-01T10:00:00.100Z",
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["d1"]);
  });
});

describe("isUniqueChargeSourceConflict", () => {
  it("detects postgres unique violations", () => {
    expect(isUniqueChargeSourceConflict({ code: "23505", message: "duplicate key" })).toBe(true);
    expect(isUniqueChargeSourceConflict({ code: "23503", message: "fk" })).toBe(false);
  });
});
