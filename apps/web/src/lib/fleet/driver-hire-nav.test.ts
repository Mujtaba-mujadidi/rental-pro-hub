import { describe, expect, it } from "vitest";
import { driverCanAccessVehicleDocuments } from "@/lib/fleet/driver-hire-nav";

describe("driverCanAccessVehicleDocuments", () => {
  it("never allows vehicle compliance documents for drivers", () => {
    expect(driverCanAccessVehicleDocuments("reserved")).toBe(false);
    expect(driverCanAccessVehicleDocuments("active")).toBe(false);
    expect(driverCanAccessVehicleDocuments("terminated")).toBe(false);
    expect(driverCanAccessVehicleDocuments("completed")).toBe(false);
  });
});
