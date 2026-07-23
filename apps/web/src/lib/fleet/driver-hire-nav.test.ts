import { describe, expect, it } from "vitest";
import { driverCanAccessVehicleDocuments } from "@/lib/fleet/driver-hire-nav";

describe("driverCanAccessVehicleDocuments", () => {
  it("allows access during reserved and active hires", () => {
    expect(driverCanAccessVehicleDocuments("reserved")).toBe(true);
    expect(driverCanAccessVehicleDocuments("active")).toBe(true);
  });

  it("denies access after hire ends", () => {
    expect(driverCanAccessVehicleDocuments("terminated")).toBe(false);
    expect(driverCanAccessVehicleDocuments("completed")).toBe(false);
    expect(driverCanAccessVehicleDocuments("cancelled")).toBe(false);
  });
});
