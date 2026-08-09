import { describe, expect, it } from "vitest";
import {
  formatDriverHireContractStartLabel,
  resolveDriverHireCompanyName,
  resolveDriverHireVehicleDisplay,
  type DriverHireDisplayLookups,
} from "@/lib/fleet/driver-hire-display";

const lookups: DriverHireDisplayLookups = {
  vehiclesById: new Map([
    ["veh-1", { vrm: "AB12 CDE", make: "Toyota", model: "Prius" }],
  ]),
  companiesById: new Map([["co-1", { name: "Acme Rentals" }]]),
  subcompaniesById: new Map([
    ["sub-1", { legalName: "Acme London Ltd", displayName: "Acme London", name: "London branch" }],
  ]),
};

describe("formatDriverHireContractStartLabel", () => {
  it("uses contract start date with default hire time", () => {
    expect(formatDriverHireContractStartLabel("2026-07-23")).toBe("23/07/2026, 09:00");
  });

  it("returns dash when start date is missing", () => {
    expect(formatDriverHireContractStartLabel(null)).toBe("—");
  });
});

describe("resolveDriverHireCompanyName", () => {
  it("uses subcompany legal name and never parent company when subcompany is set", () => {
    expect(
      resolveDriverHireCompanyName({
        parentCompanyId: "co-1",
        subcompanyId: "sub-1",
        lookups,
      }),
    ).toBe("Acme London Ltd");
  });

  it("falls back to parent company name only without subcompany", () => {
    expect(
      resolveDriverHireCompanyName({
        parentCompanyId: "co-1",
        subcompanyId: null,
        lookups,
      }),
    ).toBe("Acme Rentals");
  });
});

describe("resolveDriverHireVehicleDisplay", () => {
  it("returns vehicle labels from lookup map", () => {
    expect(resolveDriverHireVehicleDisplay("veh-1", lookups)).toEqual({
      vehicleVrm: "AB12 CDE",
      vehicleMakeModel: "Toyota Prius",
    });
  });
});
