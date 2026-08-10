import { describe, expect, it } from "vitest";
import {
  driverCanAccessVehicleDocuments,
  resolveDriverMyHireRedirectPath,
  shouldHideHireRequestFromInbox,
} from "@/lib/fleet/driver-hire-nav";
import {
  driverHireWorkspaceNav,
  isDriverHireWorkspaceNavItemActive,
} from "@/lib/fleet/driver-hire-workspace-nav";

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
  it("matches staff hire workspace tab labels", () => {
    const labels = driverHireWorkspaceNav("g1").map((item) => item.label);
    expect(labels).toEqual(["Summary", "Inspections", "Payments", "Details & documents"]);
  });

  it("highlights inspections for checkout and check-in routes", () => {
    const items = driverHireWorkspaceNav("g1");
    const inspections = items.find((item) => item.label === "Inspections")!;
    expect(isDriverHireWorkspaceNavItemActive("/driver/hires/g1/checkout", inspections)).toBe(true);
    expect(isDriverHireWorkspaceNavItemActive("/driver/hires/g1/checkin", inspections)).toBe(true);
    expect(isDriverHireWorkspaceNavItemActive("/driver/hires/g1/payments", inspections)).toBe(false);
  });

  it("highlights payments for settlement route", () => {
    const items = driverHireWorkspaceNav("g1");
    const payments = items.find((item) => item.label === "Payments")!;
    expect(isDriverHireWorkspaceNavItemActive("/driver/hires/g1/settlement", payments)).toBe(true);
  });
});
