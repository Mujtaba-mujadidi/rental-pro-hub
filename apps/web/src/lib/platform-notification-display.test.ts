import { describe, expect, it } from "vitest";
import { formatPlatformNotification, platformNotificationGroups } from "@/lib/platform-notification-display";

describe("formatPlatformNotification", () => {
  it("formats hire payment submitted notifications", () => {
    const display = formatPlatformNotification("hire_payment_submitted", {
      amountGbp: 600,
      vehicleVrm: "AB12 CDE",
      driverLabel: "John Smith",
      href: "/rental/hires/abc/payments",
    });
    expect(display.title).toContain("submitted");
    expect(display.body).toContain("John Smith");
    expect(display.body).toContain("£600.00");
    expect(display.href).toBe("/rental/hires/abc/payments");
    expect(display.actionLabel).toBe("Review payment");
  });

  it("formats hire payment approved notifications", () => {
    const display = formatPlatformNotification("hire_payment_approved", {
      amountGbp: 250,
      vehicleVrm: "AB12 CDE",
      href: "/driver/my-hire?tab=payments",
    });
    expect(display.title).toContain("approved");
    expect(display.body).toContain("£250.00");
    expect(display.body).toContain("AB12 CDE");
    expect(display.actionLabel).toBe("View payments");
  });

  it("formats hire payment amended notifications", () => {
    const display = formatPlatformNotification("hire_payment_amended", {
      amountGbp: 200,
      previousAmountGbp: 250,
      vehicleVrm: "AB12 CDE",
      comment: "Bank fee correction",
      href: "/driver/my-hire?tab=payments",
    });
    expect(display.title).toContain("amended");
    expect(display.body).toContain("£250.00");
    expect(display.body).toContain("£200.00");
    expect(display.body).toContain("Bank fee correction");
  });

  it("formats contract change rejection notifications", () => {
    const display = formatPlatformNotification("contract_change_review", {
      decision: "rejected",
      comment: "Please correct the registered address.",
    });
    expect(display.title).toContain("rejected");
    expect(display.body).toContain("Please correct the registered address.");
    expect(display.href).toBe("/rental/contract");
  });

  it("formats contract change approval notifications", () => {
    const display = formatPlatformNotification("contract_change_review", {
      decision: "approved_awaiting_signature",
    });
    expect(display.title).toContain("approved");
    expect(display.body).toContain("Sign the updated platform agreement");
    expect(display.actionLabel).toBe("Review and sign");
  });

  it("maps notification types onto inbox groups", () => {
    expect(platformNotificationGroups("hire_payment_approved")).toEqual(["payments"]);
    expect(platformNotificationGroups("contract_signed")).toEqual(["documents"]);
    expect(platformNotificationGroups("payment_validated")).toEqual(["payments"]);
    expect(platformNotificationGroups("vehicle_expiry_mot")).toEqual(["compliance"]);
    expect(platformNotificationGroups("hire_insurance_expiry")).toEqual(["compliance"]);
  });

  it("formats vehicle expiry notifications", () => {
    const display = formatPlatformNotification("vehicle_expiry_mot", {
      vehicleVrm: "AB12 CDE",
      summary: "MOT expires in 2 days",
      href: "/rental/vehicles/abc",
      tone: "expiring",
    });
    expect(display.title).toContain("expiring");
    expect(display.body).toContain("MOT expires in 2 days");
    expect(display.actionLabel).toBe("View vehicle");
  });

  it("formats driver licence expiry notifications for staff", () => {
    const display = formatPlatformNotification("driver_licence_expiry", {
      audience: "staff",
      driverLabel: "Jane Driver",
      licenceKind: "driving",
      daysUntil: 3,
      tone: "expiring",
      href: "/rental/drivers/driver-1",
    });
    expect(display.title).toContain("expiring");
    expect(display.body).toContain("Jane Driver");
    expect(display.actionLabel).toBe("View driver");
  });
});
