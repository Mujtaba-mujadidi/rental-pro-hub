import { describe, expect, it } from "vitest";
import { vehicleNextComplianceLabel } from "@/lib/rental/subcompany-fleet-display";

describe("vehicleNextComplianceLabel", () => {
  it("picks the soonest compliance date", () => {
    expect(
      vehicleNextComplianceLabel({
        mot_expiry: "2027-07-08",
        tax_expiry: "2026-12-01",
        phv_licence_expiry: "2028-01-01",
      }),
    ).toBe("Tax 1 Dec 2026");
  });

  it("returns em dash when no dates", () => {
    expect(
      vehicleNextComplianceLabel({
        mot_expiry: null,
        tax_expiry: null,
        phv_licence_expiry: null,
      }),
    ).toBe("—");
  });
});
