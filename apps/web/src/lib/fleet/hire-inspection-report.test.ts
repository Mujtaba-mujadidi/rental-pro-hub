import { describe, expect, it } from "vitest";
import {
  buildHireInspectionReportSections,
  hireInspectionReportFileName,
  hireInspectionReportTitle,
} from "@/lib/fleet/hire-inspection-report";
import { EMPTY_HIRE_INSPECTION_ACCESSORIES } from "@/lib/fleet/hire-inspection-accessories";

describe("hireInspectionReportTitle", () => {
  it("labels checkout and check-in", () => {
    expect(hireInspectionReportTitle("checkout")).toBe("Vehicle checkout report");
    expect(hireInspectionReportTitle("checkin")).toBe("Vehicle check-in report");
  });
});

describe("hireInspectionReportFileName", () => {
  it("sanitises vehicle label", () => {
    expect(hireInspectionReportFileName("checkout", "AB12 CDE")).toBe("checkout-AB12-CDE.pdf");
  });
});

describe("buildHireInspectionReportSections", () => {
  it("includes readings, kit, damage, and notes", () => {
    const sections = buildHireInspectionReportSections({
      kind: "checkout",
      vehicleLabel: "AB12 CDE · Ford Focus",
      completedAt: "2026-07-28T12:00:00.000Z",
      odometerReading: 12000,
      fuelLevel: 75,
      accessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES, hasSpareTyre: true },
      generalNotes: "Minor scuff noted.",
      damages: [
        {
          panelLabel: "Front bumper",
          damageType: "scratch",
          severity: "minor",
          notes: "Near number plate",
        },
      ],
      photoCount: 3,
    });

    expect(sections[0]?.[0]).toBe("Vehicle checkout report");
    expect(sections.flat().join("\n")).toContain("Odometer: 12000 mi");
    expect(sections.flat().join("\n")).toContain("Fuel: 75%");
    expect(sections.flat().join("\n")).toContain("Spare tyre: Present");
    expect(sections.flat().join("\n")).toContain("Front bumper");
    expect(sections.flat().join("\n")).toContain("Minor scuff noted.");
  });

  it("notes when no damage recorded", () => {
    const sections = buildHireInspectionReportSections({
      kind: "checkin",
      vehicleLabel: "XY99 ZZZ",
      completedAt: null,
      odometerReading: null,
      fuelLevel: null,
      accessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES },
      generalNotes: null,
      damages: [],
      photoCount: 0,
    });

    expect(sections.flat().join("\n")).toContain("No damage recorded.");
  });
});
