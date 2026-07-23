import { describe, expect, it } from "vitest";
import { formatPlatformNotification } from "@/lib/platform-notification-display";

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
    expect(display.href).toBe("/driver/my-hire?tab=payments");
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
});
