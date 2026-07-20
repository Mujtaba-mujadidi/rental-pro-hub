import { describe, expect, it } from "vitest";
import {
  isVehicleWorkspaceNavItemActive,
  parseVehicleWorkspaceId,
  parseVehicleWorkspaceSection,
  vehicleWorkspaceHref,
  vehicleWorkspaceNav,
} from "@/lib/fleet/vehicle-workspace-nav";

describe("vehicleWorkspaceNav / href", () => {
  it("builds section links for a vehicle id", () => {
    const nav = vehicleWorkspaceNav("v1");
    expect(nav[0]).toEqual({ href: "/rental/vehicles/v1", label: "Dashboard", match: "exact" });
    expect(nav.find((i) => i.label === "Maintenance")?.href).toBe("/rental/vehicles/v1/maintenance");
    expect(vehicleWorkspaceHref("v1")).toBe("/rental/vehicles/v1");
    expect(vehicleWorkspaceHref("v1", "maintenance")).toBe("/rental/vehicles/v1/maintenance");
  });
});

describe("parseVehicleWorkspaceSection", () => {
  it("returns empty for dashboard or unknown", () => {
    expect(parseVehicleWorkspaceSection("/rental/vehicles/v1", "v1")).toBe("");
    expect(parseVehicleWorkspaceSection("/rental/vehicles/other/details", "v1")).toBe("");
    expect(parseVehicleWorkspaceSection("/rental/vehicles/v1/unknown", "v1")).toBe("");
  });

  it("parses known sections", () => {
    expect(parseVehicleWorkspaceSection("/rental/vehicles/v1/details", "v1")).toBe("details");
    expect(parseVehicleWorkspaceSection("/rental/vehicles/v1/maintenance/extra", "v1")).toBe("maintenance");
  });
});

describe("parseVehicleWorkspaceId", () => {
  it("extracts id or null", () => {
    expect(parseVehicleWorkspaceId("/rental/vehicles/abc")).toBe("abc");
    expect(parseVehicleWorkspaceId("/rental/fleet")).toBeNull();
  });
});

describe("isVehicleWorkspaceNavItemActive", () => {
  it("exact vs prefix matching", () => {
    const dash = { href: "/rental/vehicles/v1", label: "Dashboard", match: "exact" as const };
    const maint = { href: "/rental/vehicles/v1/maintenance", label: "Maintenance", match: "prefix" as const };
    expect(isVehicleWorkspaceNavItemActive("/rental/vehicles/v1", dash)).toBe(true);
    expect(isVehicleWorkspaceNavItemActive("/rental/vehicles/v1/details", dash)).toBe(false);
    expect(isVehicleWorkspaceNavItemActive("/rental/vehicles/v1/maintenance", maint)).toBe(true);
    expect(isVehicleWorkspaceNavItemActive("/rental/vehicles/v1/maintenance/x", maint)).toBe(true);
  });
});
