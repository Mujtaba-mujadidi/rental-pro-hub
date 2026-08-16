import { describe, expect, it } from "vitest";
import { defaultNotificationSettings } from "@/lib/settings/notification-settings";
import {
  vehicleListNextExpiryDisplay,
  vehicleNextComplianceLabel,
} from "@/lib/rental/subcompany-fleet-display";

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

describe("vehicleListNextExpiryDisplay", () => {
  const settings = defaultNotificationSettings();

  it("uses attention message when a date is expired", () => {
    const result = vehicleListNextExpiryDisplay(
      {
        mot_expiry: "2020-01-01",
        tax_expiry: "2030-01-01",
        phv_licence_expiry: "2030-01-01",
      },
      settings,
    );
    expect(result.tone).toBe("expired");
    expect(result.label).toMatch(/^MOT expired/);
  });

  it("falls back to soonest compliance when all dates are healthy", () => {
    const result = vehicleListNextExpiryDisplay(
      {
        mot_expiry: "2030-03-30",
        tax_expiry: "2031-01-01",
        phv_licence_expiry: "2031-06-01",
      },
      settings,
    );
    expect(result.tone).toBe("ok");
    expect(result.label).toBe("MOT 30 Mar 2030");
  });
});
