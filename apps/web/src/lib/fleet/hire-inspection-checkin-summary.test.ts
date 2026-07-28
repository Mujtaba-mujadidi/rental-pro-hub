import { describe, expect, it } from "vitest";
import { EMPTY_HIRE_INSPECTION_ACCESSORIES } from "@/lib/fleet/hire-inspection-accessories";
import {
  formatInspectionOdometerDisplay,
  summarizeCheckinVehicleChanges,
} from "@/lib/fleet/hire-inspection-checkin-summary";

describe("formatInspectionOdometerDisplay", () => {
  it("formats miles and handles empty values", () => {
    expect(formatInspectionOdometerDisplay(12345.4)).toBe("12345.4 mi");
    expect(formatInspectionOdometerDisplay("12000")).toBe("12000 mi");
    expect(formatInspectionOdometerDisplay(null)).toBe("Not recorded");
    expect(formatInspectionOdometerDisplay("")).toBe("Not recorded");
  });
});

describe("summarizeCheckinVehicleChanges", () => {
  it("flags changed readings and accessories", () => {
    const result = summarizeCheckinVehicleChanges({
      checkoutOdometer: 10000,
      checkoutFuelLevel: 80,
      checkoutAccessories: {
        ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
        hasSpareTyre: true,
        hasChargingCable: true,
      },
      checkoutNotes: "Clean vehicle",
      checkoutMediaCount: 2,
      checkinOdometer: "10500",
      checkinFuelLevel: 40,
      checkinAccessories: {
        ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
        hasSpareTyre: true,
        hasChargingCable: false,
      },
      checkinNotes: "Clean vehicle",
      checkinMediaCount: 4,
    });

    expect(result.hasAnyChange).toBe(true);
    expect(result.odometerDeltaMiles).toBe(500);
    expect(result.rows.find((row) => row.id === "odometer")?.changed).toBe(true);
    expect(result.rows.find((row) => row.id === "fuel")?.changed).toBe(true);
    expect(result.rows.find((row) => row.id === "photos")?.changed).toBe(true);
    expect(result.rows.find((row) => row.id === "notes")?.changed).toBe(false);
    expect(result.accessoryChanges).toHaveLength(1);
    expect(result.accessoryChanges[0]?.label).toBe("Charging cable");
  });

  it("reports no changes when readings match", () => {
    const result = summarizeCheckinVehicleChanges({
      checkoutOdometer: 10000,
      checkoutFuelLevel: 50,
      checkoutAccessories: EMPTY_HIRE_INSPECTION_ACCESSORIES,
      checkoutNotes: null,
      checkoutMediaCount: 1,
      checkinOdometer: "10000",
      checkinFuelLevel: 50,
      checkinAccessories: EMPTY_HIRE_INSPECTION_ACCESSORIES,
      checkinNotes: "",
      checkinMediaCount: 1,
    });

    expect(result.hasAnyChange).toBe(false);
    expect(result.accessoryChanges).toHaveLength(0);
  });
});
