import { describe, expect, it } from "vitest";
import {
  buildHireEndedInspectionAttentionItems,
} from "@/lib/fleet/hire-ended-inspection-attention";
import { EMPTY_HIRE_INSPECTION_ACCESSORIES } from "@/lib/fleet/hire-inspection-accessories";

describe("buildHireEndedInspectionAttentionItems", () => {
  it("returns nothing before check-in is completed", () => {
    expect(
      buildHireEndedInspectionAttentionItems({
        hireGroupId: "g1",
        checkinHref: "/rental/hires/g1/checkin",
        checkoutOdometerMiles: 1000,
        checkoutAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: true },
        checkinOdometerMiles: 1100,
        checkinAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: false },
        checkinDamages: [{ checkoutDamageId: null }],
        checkinCompleted: false,
      }),
    ).toEqual([]);
  });

  it("flags mileage when return reading is lower than checkout", () => {
    const items = buildHireEndedInspectionAttentionItems({
      hireGroupId: "g1",
      checkinHref: "/rental/hires/g1/checkin",
      checkoutOdometerMiles: 1000,
      checkoutAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES },
      checkinOdometerMiles: 900,
      checkinAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES },
      checkinDamages: [],
      checkinCompleted: true,
    });

    expect(items).toEqual([
      {
        key: "mileage",
        title: "Mileage needs review",
        detail: "Return mileage is lower than checkout",
        href: "/rental/hires/g1/checkin",
        tone: "danger",
      },
    ]);
  });

  it("builds damage and kit attention rows after check-in", () => {
    const items = buildHireEndedInspectionAttentionItems({
      hireGroupId: "g1",
      checkinHref: "/rental/hires/g1/checkin",
      checkoutOdometerMiles: 1000,
      checkoutAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: true },
      checkinOdometerMiles: 1100,
      checkinAccessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: false },
      checkinDamages: [{ checkoutDamageId: null }, { checkoutDamageId: "existing" }],
      checkinCompleted: true,
    });

    expect(items.map((item) => item.key)).toEqual(["damage", "kit"]);
    expect(items.find((item) => item.key === "damage")?.count).toBe(1);
    expect(items.find((item) => item.key === "kit")?.count).toBe(1);
  });
});
