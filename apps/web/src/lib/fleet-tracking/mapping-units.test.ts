import { describe, expect, it } from "vitest";
import {
  formatMiles,
  kmhToMph,
  kmToMiles,
  metresToMiles,
  milesToKm,
  milesToMetres,
  milesToSetMileageKmString,
  trackOdometerMatchesMiles,
} from "@/lib/fleet-tracking/units";
import {
  baseVrmFromDeviceLabel,
  describeTrackingDataSource,
  deviceGroupOptionLabel,
  deviceMatchLabel,
  groupDevicesByBaseVrm,
  isImobDeviceLabel,
  suggestVehicleMappings,
  validateVehicleMappingLinks,
  type TrackerDevice,
} from "@/lib/fleet-tracking/mapping";
import {
  clampMileageWindowToExclusiveCap,
  commandResponseLooksFailed,
  explainDeviceCommandError,
  dataStatusLabel,
  parseMileageExclusiveCapUnix,
  sanitizeMileageError,
  snapToHalfHourUnix,
  weeklyMileageWindowUnix,
} from "@/lib/fleet-tracking/smartcar-tracker-client";

describe("fleet-tracking units", () => {
  it("converts distances and speed", () => {
    expect(metresToMiles(1609.344)).toBeCloseTo(1, 5);
    expect(milesToMetres(1)).toBeCloseTo(1609.344, 5);
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 5);
    expect(milesToKm(1)).toBeCloseTo(1.609344, 5);
    expect(milesToSetMileageKmString(1)).toBe("2");
    expect(milesToSetMileageKmString(30000)).toBe("48280");
    expect(trackOdometerMatchesMiles(1609.344, 1)).toBe(true);
    expect(trackOdometerMatchesMiles(1609.344, 10)).toBe(false);
    expect(kmhToMph(160.9344)).toBeCloseTo(100, 3);
    expect(formatMiles(12.6, 0)).toBe("13");
    expect(formatMiles(12.6, 1)).toBe("12.6");
  });

  it("guards non-finite / negative inputs", () => {
    expect(metresToMiles(-1)).toBe(0);
    expect(kmToMiles(Number.NaN)).toBe(0);
    expect(milesToKm(-5)).toBe(0);
    expect(kmhToMph(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("fleet-tracking mapping", () => {
  const devices: TrackerDevice[] = [
    { imei: "1", devicename: "AB12CDE", platenumber: "" },
    { imei: "2", devicename: "AB12CDE iMob", platenumber: "" },
    { imei: "3", devicename: "ZZ99ZZZ", platenumber: "" },
  ];

  it("normalizes device labels and detects iMob", () => {
    expect(baseVrmFromDeviceLabel("AB12 CDE iMob")).toBe("AB12CDE");
    expect(baseVrmFromDeviceLabel("")).toBe("");
    expect(isImobDeviceLabel("AB12CDE-IMOB")).toBe(true);
    expect(isImobDeviceLabel("AB12CDE")).toBe(false);
  });

  it("describes tracking data source for UI", () => {
    expect(
      describeTrackingDataSource({
        vehicleVrm: "AB12 CDE",
        role: "primary",
        deviceLabel: "AB12 CDE iMob",
        isImobDevice: true,
        hasSecondaryDevice: true,
        secondaryDeviceLabel: "AB12 CDE",
      }),
    ).toBe("Primary device (immobiliser) · AB12 CDE iMob");
  });

  it("groups devices and suggests mappings", () => {
    const groups = groupDevicesByBaseVrm(devices);
    const ab = groups.find((g) => g.baseVrm === "AB12CDE");
    expect(ab?.devices).toHaveLength(2);
    expect(ab?.primaryImei).toBe("2");
    expect(ab?.secondaryImei).toBe("1");
    expect(deviceMatchLabel(devices[0]!)).toBe("AB12CDE");

    const { suggestions, unmatchedVehicles, unmatchedDevices } = suggestVehicleMappings(
      [
        {
          id: "v1",
          vrm: "AB12CDE",
          make: "Ford",
          model: "Focus",
          gps_primary_imei: null,
          gps_secondary_imei: null,
        },
        {
          id: "v2",
          vrm: "NOMATCH",
          make: "VW",
          model: "Golf",
          gps_primary_imei: null,
          gps_secondary_imei: null,
        },
      ],
      devices,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.vehicleId).toBe("v1");
    expect(suggestions[0]!.alreadyLinked).toBe(false);
    expect(unmatchedVehicles.map((v) => v.id)).toEqual(["v2"]);
    expect(unmatchedDevices.some((g) => g.baseVrm === "ZZ99ZZZ")).toBe(true);
  });

  it("labels device groups for manual link dropdowns", () => {
    const groups = groupDevicesByBaseVrm(devices);
    const ab = groups.find((g) => g.baseVrm === "AB12CDE");
    expect(ab).toBeDefined();
    expect(deviceGroupOptionLabel(ab!)).toBe("AB12CDE iMob + AB12CDE (AB12CDE)");
  });

  it("validates manual mapping links", () => {
    const vehicles = [
      {
        id: "v1",
        vrm: "AB12CDE",
        gps_primary_imei: null,
        gps_secondary_imei: null,
      },
      {
        id: "v2",
        vrm: "ZZ99ZZZ",
        gps_primary_imei: "9",
        gps_secondary_imei: null,
      },
    ];
    const accountImeis = new Set(["1", "2", "3", "9"]);

    expect(
      validateVehicleMappingLinks(
        [{ vehicleId: "v1", primaryImei: "3", secondaryImei: null }],
        { accountImeis, vehicles },
      ).ok,
    ).toBe(true);

    expect(
      validateVehicleMappingLinks(
        [{ vehicleId: "v1", primaryImei: "3", secondaryImei: "3" }],
        { accountImeis, vehicles },
      ),
    ).toEqual({ ok: false, error: "Secondary device must differ from primary." });

    expect(
      validateVehicleMappingLinks(
        [{ vehicleId: "v1", primaryImei: "9", secondaryImei: null }],
        { accountImeis, vehicles },
      ),
    ).toEqual({ ok: false, error: "Device 9 is already linked to ZZ99ZZZ." });

    expect(
      validateVehicleMappingLinks(
        [
          { vehicleId: "v1", primaryImei: "1", secondaryImei: null },
          { vehicleId: "missing", primaryImei: "2", secondaryImei: null },
        ],
        { accountImeis, vehicles },
      ),
    ).toEqual({ ok: false, error: "One or more vehicles could not be found." });
  });
});

describe("SmartCar Tracker helpers", () => {
  it("snaps to half hour and labels data status", () => {
    const snapped = snapToHalfHourUnix(new Date("2026-07-20T12:17:00.000Z"));
    expect(snapped % 1800).toBe(0);
    expect(dataStatusLabel(undefined)).toBe("Unknown");
    expect(dataStatusLabel(2)).toBe("Online");
    expect(dataStatusLabel(99)).toBe("Status 99");
  });

  it("keeps weekly mileage window under 7 days", () => {
    const { beginUnix, endUnix } = weeklyMileageWindowUnix(new Date("2026-07-20T12:17:00.000Z"));
    expect(endUnix).toBeGreaterThan(beginUnix);
    expect(endUnix - beginUnix).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(endUnix % 1800).toBe(0);
    expect(beginUnix % 1800).toBe(0);
  });

  it("detects failed command responses", () => {
    expect(commandResponseLooksFailed("Set mileage: Success!")).toBe(false);
    expect(commandResponseLooksFailed("Set mileage failed")).toBe(true);
    expect(commandResponseLooksFailed("Device offline")).toBe(true);
    expect(explainDeviceCommandError("ERROR:103")).toMatch(/kilometres/i);
    expect(explainDeviceCommandError("ERROR:101")).toMatch(/too large/i);
  });

  it("parses exclusive mileage caps and sanitizes errors", () => {
    const msg =
      "parameter endtime error, value=The imei 355468591640537 can only query data that is less than 1784505600";
    expect(parseMileageExclusiveCapUnix(msg)).toBe(1784505600);
    expect(sanitizeMileageError(msg)).not.toMatch(/355468591640537/);
    expect(sanitizeMileageError(msg)).not.toMatch(/protrack/i);
  });

  it("clamps mileage window below exclusive cap", () => {
    const begin = 1783900800;
    const end = 1784518200;
    const clamped = clampMileageWindowToExclusiveCap(begin, end, 1784505600);
    expect(clamped).not.toBeNull();
    expect(clamped!.endUnix).toBeLessThan(1784505600);
    expect(clamped!.endUnix % 1800).toBe(0);
    expect(clamped!.beginUnix).toBeLessThan(clamped!.endUnix);
    expect(clamped!.endUnix - clamped!.beginUnix).toBeLessThanOrEqual(7 * 24 * 3600);
    // Pure UTC half-hour math (no local timezone snap)
    expect(clamped!.endUnix).toBe(1784503800);
  });
});
