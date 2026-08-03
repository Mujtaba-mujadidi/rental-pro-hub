import { describe, expect, it } from "vitest";
import {
  driverCanAccessVehicleDocuments,
  resolveDriverMyHireRedirectPath,
  shouldHideHireRequestFromInbox,
} from "@/lib/fleet/driver-hire-nav";
import { driverHireWorkspaceNav } from "@/lib/fleet/driver-hire-workspace-nav";

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

describe("resolveDriverMyHireRedirectPath", () => {
  it("opens the hire workspace overview by default", () => {
    expect(resolveDriverMyHireRedirectPath("g1", null)).toBe("/driver/hires/g1");
    expect(resolveDriverMyHireRedirectPath("g1", "overview")).toBe("/driver/hires/g1");
  });

  it("maps legacy tab query params to workspace sections", () => {
    expect(resolveDriverMyHireRedirectPath("g1", "payments")).toBe("/driver/hires/g1/payments");
    expect(resolveDriverMyHireRedirectPath("g1", "details")).toBe("/driver/hires/g1/details");
  });
});

describe("driverHireWorkspaceNav", () => {
  it("shows checkout but not check-in while hire is active", () => {
    const labels = driverHireWorkspaceNav("g1", "active").map((item) => item.label);
    expect(labels).toContain("Checkout");
    expect(labels).not.toContain("Check-in");
  });

  it("shows check-in only after the contract has ended", () => {
    expect(driverHireWorkspaceNav("g1", "terminated").map((item) => item.label)).toContain("Check-in");
    expect(driverHireWorkspaceNav("g1", "completed").map((item) => item.label)).toContain("Check-in");
    expect(driverHireWorkspaceNav("g1", "reserved").map((item) => item.label)).not.toContain("Check-in");
  });
});
