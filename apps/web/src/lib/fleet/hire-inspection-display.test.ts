import { describe, expect, it } from "vitest";
import {
  formatHireInspectionOdometer,
  formatHireInspectionStamp,
  formatHireInspectionTimeOnly,
  summarizeInspectionKit,
} from "@/lib/fleet/hire-inspection-display";

describe("hire-inspection-display", () => {
  it("formats inspection stamp from ISO timestamp", () => {
    expect(formatHireInspectionStamp("2026-08-10T00:23:00.000Z")).toMatch(/10 Aug 2026 · \d{2}:23/);
  });

  it("formats odometer with UK grouping", () => {
    expect(formatHireInspectionOdometer(67189)).toBe("67,189 mi");
  });

  it("summarizes kit accessory counts", () => {
    expect(
      summarizeInspectionKit(
        {
          hasSpareTyre: true,
          hasTyreKeyLocks: true,
          hasTyreInflationKit: true,
          hasChargingCable: false,
          hasTyreReplacementKit: false,
        },
        [
          "hasSpareTyre",
          "hasTyreKeyLocks",
          "hasTyreInflationKit",
          "hasChargingCable",
          "hasTyreReplacementKit",
        ],
      ),
    ).toBe("3 present · 2 not present");
  });

  it("extracts inspection time", () => {
    expect(formatHireInspectionTimeOnly("2026-08-10T00:23:00.000Z")).toMatch(/\d{2}:23/);
  });
});
