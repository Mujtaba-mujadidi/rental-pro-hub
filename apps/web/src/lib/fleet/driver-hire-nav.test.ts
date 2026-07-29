import { describe, expect, it } from "vitest";
import { driverCanAccessVehicleDocuments, shouldHideHireRequestFromInbox } from "@/lib/fleet/driver-hire-nav";

describe("shouldHideHireRequestFromInbox", () => {
  it("hides fully signed requests regardless of hire status", () => {
    expect(
      shouldHideHireRequestFromInbox({
        signingPhase: "fully_signed",
        hireGroupStatus: "active",
      }),
    ).toBe(true);
    expect(
      shouldHideHireRequestFromInbox({
        signingPhase: "fully_signed",
        hireGroupStatus: "terminated",
      }),
    ).toBe(true);
  });

  it("keeps actionable requests visible", () => {
    expect(
      shouldHideHireRequestFromInbox({
        signingPhase: "awaiting_signature",
        hireGroupStatus: "reserved",
        accessRequestStatus: "approved",
      }),
    ).toBe(false);
    expect(
      shouldHideHireRequestFromInbox({
        signingPhase: "not_ready",
        hireGroupStatus: null,
        accessRequestStatus: "pending",
      }),
    ).toBe(false);
  });

  it("hides rejected access requests", () => {
    expect(
      shouldHideHireRequestFromInbox({
        signingPhase: "not_ready",
        hireGroupStatus: null,
        accessRequestStatus: "rejected",
      }),
    ).toBe(true);
  });
});

describe("driverCanAccessVehicleDocuments", () => {
  it("never allows vehicle compliance documents for drivers", () => {
    expect(driverCanAccessVehicleDocuments("reserved")).toBe(false);
    expect(driverCanAccessVehicleDocuments("active")).toBe(false);
    expect(driverCanAccessVehicleDocuments("terminated")).toBe(false);
    expect(driverCanAccessVehicleDocuments("completed")).toBe(false);
  });
});
