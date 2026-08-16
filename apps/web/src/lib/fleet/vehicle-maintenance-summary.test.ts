import { describe, expect, it } from "vitest";
import {
  buildLastServiceSummary,
  buildNextServiceSummary,
  findLastServiceRecord,
  formatMiles,
  highestRecordedOdometer,
  maintenanceTypeLabel,
  milesRemainingToNextService,
  resolveEffectiveCurrentMileage,
} from "@/lib/fleet/vehicle-maintenance-summary";

describe("vehicle maintenance summary", () => {
  it("finds the latest service record", () => {
    expect(
      findLastServiceRecord([
        { occurred_on: "2026-04-04", category: "repair", odometer_miles: 100 },
        { occurred_on: "2026-06-18", category: "service", odometer_miles: 64280 },
        { occurred_on: "2026-01-22", category: "service", odometer_miles: 54210 },
      ]),
    ).toEqual({
      occurred_on: "2026-06-18",
      category: "service",
      odometer_miles: 64280,
    });
  });

  it("builds last service labels", () => {
    const summary = buildLastServiceSummary([
      { occurred_on: "2026-06-18", category: "service", odometer_miles: 64280 },
    ]);
    expect(summary?.dateLabel).toBe("18 Jun");
    expect(summary?.mileageHint).toBe("At 64,280 miles");
  });

  it("computes miles remaining and next-service card copy", () => {
    expect(milesRemainingToNextService(64280, 67700)).toBe(3420);
    const summary = buildNextServiceSummary({
      serviceDueAt: "2026-10-15",
      nextServiceMileage: 67700,
      currentMileage: 64280,
      todayYmd: "2026-08-16",
    });
    expect(summary.valueLabel).toBe("Miles remaining");
    expect(summary.value).toBe("3,420 mi");
    expect(
      buildNextServiceSummary({
        serviceDueAt: null,
        nextServiceMileage: null,
        currentMileage: null,
        todayYmd: "2026-08-16",
      }),
    ).toEqual({
      valueLabel: "Next service",
      value: "—",
      hint: "Set on the next service log",
      tone: "neutral",
    });
  });

  it("rejects tracker mileage below recorded service odometer", () => {
    expect(highestRecordedOdometer([{ occurred_on: "2026-01-01", category: "service", odometer_miles: 170000 }])).toBe(
      170000,
    );
    expect(
      resolveEffectiveCurrentMileage({
        trackerMiles: 1729,
        storedMiles: 1729,
        recordedFloorMiles: 170000,
      }),
    ).toEqual({ miles: 170000, source: "recorded" });
    expect(
      resolveEffectiveCurrentMileage({
        trackerMiles: 171500,
        storedMiles: 170000,
        recordedFloorMiles: 170000,
      }),
    ).toEqual({ miles: 171500, source: "tracker" });
  });

  it("formats type with optional description", () => {
    expect(maintenanceTypeLabel("service", "Oil, filters & inspection")).toEqual({
      primary: "Service",
      secondary: "Oil, filters & inspection",
    });
    expect(formatMiles(64280)).toBe("64,280");
  });
});
