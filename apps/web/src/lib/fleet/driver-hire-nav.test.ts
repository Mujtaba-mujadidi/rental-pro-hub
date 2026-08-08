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
  it("allows vehicle compliance documents only while the hire is active", () => {
    expect(driverCanAccessVehicleDocuments("active")).toBe(true);
    expect(driverCanAccessVehicleDocuments("reserved")).toBe(false);
    expect(driverCanAccessVehicleDocuments("terminated")).toBe(false);
    expect(driverCanAccessVehicleDocuments("completed")).toBe(false);
    expect(driverCanAccessVehicleDocuments("cancelled")).toBe(false);
    expect(driverCanAccessVehicleDocuments("draft")).toBe(false);
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
    expect(resolveDriverMyHireRedirectPath("g1", "checkout")).toBe("/driver/hires/g1/checkout");
    expect(resolveDriverMyHireRedirectPath("g1", "checkin")).toBe("/driver/hires/g1/checkin");
    expect(resolveDriverMyHireRedirectPath("g1", "settlement")).toBe("/driver/hires/g1/settlement");
  });
});

describe("driverHireWorkspaceNav", () => {
  it("mirrors staff tab order for active hires", () => {
    const labels = driverHireWorkspaceNav("g1", "active").map((item) => item.label);
    expect(labels).toEqual(["Overview", "Checkout", "Payments", "Details"]);
  });

  it("mirrors staff tab order for ended hires", () => {
    const labels = driverHireWorkspaceNav("g1", "terminated").map((item) => item.label);
    expect(labels).toEqual([
      "Overview",
      "Checkout",
      "Check-in",
      "Settlement",
      "Payments & settlement",
      "Details",
    ]);
  });

  it("does not include check-in while hire is active", () => {
    expect(driverHireWorkspaceNav("g1", "active").map((item) => item.label)).not.toContain("Check-in");
    expect(driverHireWorkspaceNav("g1", "reserved").map((item) => item.label)).not.toContain("Check-in");
  });
});
