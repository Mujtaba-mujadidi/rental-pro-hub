import { describe, expect, it } from "vitest";
import { EMPTY_HIRE_INSPECTION_ACCESSORIES } from "@/lib/fleet/hire-inspection-accessories";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  buildHireInspectionComparisonTable,
  hireInspectionCheckinNeedsReview,
} from "@/lib/fleet/hire-inspection-comparison-display";
import type { HireInspectionPayload } from "@/app/actions/hire-inspections";

function basePayload(overrides: Partial<HireInspectionPayload> = {}): HireInspectionPayload {
  return {
    id: "insp-1",
    hireGroupId: "hire-1",
    vehicleId: "veh-1",
    kind: "checkout",
    status: "completed",
    odometerReading: 17500,
    fuelLevel: 25,
    generalNotes: "",
    accessories: {
      ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
      hasSpareTyre: true,
      hasChargingCable: true,
      hasTyreInflationKit: true,
    },
    completedAt: "2026-08-10T01:23:00Z",
    damages: [{ id: "d1", panelId: "front_windscreen", panelLabel: "Front windscreen", damageType: "chip", severity: "minor", notes: null, checkoutDamageId: null, diagramView: null, pinX: null, pinY: null, chargeGbp: null, chargeResolution: null }],
    media: [],
    checkoutCompleted: true,
    checkinCompleted: true,
    ...overrides,
  };
}

describe("buildHireInspectionComparisonTable", () => {
  it("flags invalid mileage and kit missing like the ended-hire prototype", () => {
    const checkout = basePayload();
    const checkin = basePayload({
      kind: "checkin",
      odometerReading: 17000,
      fuelLevel: 25,
      accessories: {
        ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
        hasSpareTyre: false,
        hasChargingCable: false,
        hasTyreInflationKit: false,
      },
      damages: [
        { id: "d1", panelId: "front_windscreen", panelLabel: "Front windscreen", damageType: "chip", severity: "minor", notes: null, checkoutDamageId: "d1", diagramView: null, pinX: null, pinY: null, chargeGbp: null, chargeResolution: null },
        { id: "d2", panelId: "left_front_door", panelLabel: "Left front door", damageType: "scratch", severity: "minor", notes: null, checkoutDamageId: "d1", diagramView: null, pinX: null, pinY: null, chargeGbp: null, chargeResolution: null },
        { id: "d3", panelId: "rear_bumper", panelLabel: "Rear bumper", damageType: "dent", severity: "moderate", notes: null, checkoutDamageId: null, diagramView: null, pinX: null, pinY: null, chargeGbp: null, chargeResolution: null },
        { id: "d4", panelId: "right_rear_door", panelLabel: "Right rear door", damageType: "scratch", severity: "minor", notes: null, checkoutDamageId: null, diagramView: null, pinX: null, pinY: null, chargeGbp: null, chargeResolution: null },
      ],
    });
    const damageDiff = buildHireInspectionDiff(checkout.damages, checkin.damages);
    const rows = buildHireInspectionComparisonTable({ checkout, checkin, damageDiff });

    expect(rows.find((row) => row.id === "mileage")).toMatchObject({
      checkoutDisplay: "17500 mi",
      checkinDisplay: "17000 mi",
      resultLabel: "Invalid reading",
      resultTone: "danger",
    });
    expect(rows.find((row) => row.id === "fuel")).toMatchObject({
      resultLabel: "No change",
      resultTone: "success",
    });
    expect(rows.find((row) => row.id === "damage")).toMatchObject({
      checkoutDisplay: "1 existing",
      checkinDisplay: "2 existing + 2 new",
      resultLabel: "2 new items",
      resultTone: "warn",
    });
    expect(rows.find((row) => row.id === "kit")).toMatchObject({
      checkoutDisplay: "3 items present",
      checkinDisplay: "None present",
      resultLabel: "3 missing",
      resultTone: "warn",
    });
  });
});

describe("hireInspectionCheckinNeedsReview", () => {
  it("returns true when mileage is invalid", () => {
    const checkout = basePayload();
    const checkin = basePayload({ odometerReading: 17000 });
    expect(hireInspectionCheckinNeedsReview({ checkout, checkin })).toBe(true);
  });
});
