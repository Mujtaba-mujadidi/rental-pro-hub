import { describe, expect, it } from "vitest";
import {
  isPhvTaxiLicencePaperDocType,
  isVehicleDocType,
  isVehicleStatus,
  missingRequiredDocTypes,
  normalizeVrm,
} from "@/lib/fleet/vehicles";

describe("normalizeVrm", () => {
  it("uppercases and strips spaces/hyphens", () => {
    expect(normalizeVrm(" ab12 cde ")).toBe("AB12CDE");
    expect(normalizeVrm("AB-12-CDE")).toBe("AB12CDE");
  });
});

describe("isVehicleStatus / isVehicleDocType", () => {
  it("accepts known values only", () => {
    expect(isVehicleStatus("available")).toBe(true);
    expect(isVehicleStatus("sold")).toBe(false);
    expect(isVehicleDocType("mot")).toBe(true);
    expect(isVehicleDocType("MOT")).toBe(false);
  });
});

describe("isPhvTaxiLicencePaperDocType", () => {
  it("accepts paper aliases case-insensitively", () => {
    expect(isPhvTaxiLicencePaperDocType("phv_taxi_licence_paper")).toBe(true);
    expect(isPhvTaxiLicencePaperDocType("PCO_PAPER")).toBe(true);
    expect(isPhvTaxiLicencePaperDocType("phv_licence")).toBe(true);
    expect(isPhvTaxiLicencePaperDocType("mot")).toBe(false);
  });
});

describe("missingRequiredDocTypes", () => {
  it("lists all when none present", () => {
    expect(missingRequiredDocTypes([])).toEqual(["mot", "logbook", "phv_taxi_licence_paper"]);
  });

  it("treats legacy aliases as satisfying PHV paper", () => {
    expect(missingRequiredDocTypes(["mot", "logbook", "pco_paper"])).toEqual([]);
    expect(missingRequiredDocTypes(["mot", "logbook", "phv_licence"])).toEqual([]);
  });

  it("reports only missing slots", () => {
    expect(missingRequiredDocTypes(["mot", "phv_taxi_licence_paper"])).toEqual(["logbook"]);
  });
});
