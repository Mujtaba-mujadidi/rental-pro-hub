import { describe, expect, it } from "vitest";
import {
  buildDriverDashboardPayload,
  buildDriverLicenceStatusRows,
  driverGreetingFirstName,
  driverHireVrmInitials,
  earliestLicenceExpiryYmd,
  formatDriverAmountDueDetail,
  formatDriverNextRentDetail,
  mapDriverDashboardNextSteps,
  summariseDriverLicenceKpi,
} from "@/lib/fleet/driver-dashboard-display";

describe("driverGreetingFirstName", () => {
  it("returns first token", () => {
    expect(driverGreetingFirstName("Mujtaba Driver")).toBe("Mujtaba");
  });

  it("falls back for empty or email-like names", () => {
    expect(driverGreetingFirstName(null)).toBe("there");
    expect(driverGreetingFirstName("user@example.com")).toBe("there");
  });
});

describe("driverHireVrmInitials", () => {
  it("uses first two alphanumeric characters", () => {
    expect(driverHireVrmInitials("KE18 FSX")).toBe("KE");
    expect(driverHireVrmInitials("AF67OEC")).toBe("AF");
  });
});

describe("formatDriverAmountDueDetail", () => {
  it("formats deposit and rent compactly", () => {
    expect(
      formatDriverAmountDueDetail({ depositOutstandingGbp: 100, rentOutstandingGbp: 10 }),
    ).toBe("£100.00 deposit + £10.00 rent");
  });
});

describe("formatDriverNextRentDetail", () => {
  it("labels tomorrow with cadence", () => {
    expect(
      formatDriverNextRentDetail({
        periodStartYmd: "2026-08-15",
        cadence: "daily",
        todayYmd: "2026-08-14",
      }),
    ).toBe("Due tomorrow · daily");
  });
});

describe("licence helpers", () => {
  it("summarises current licences", () => {
    const rows = buildDriverLicenceStatusRows({
      drivingLicenceExpiryYmd: "2027-04-10",
      phvLicenceExpiryYmd: "2027-03-31",
    });
    expect(rows.every((r) => r.tone === "ok")).toBe(true);
    const earliest = earliestLicenceExpiryYmd({
      drivingLicenceExpiryYmd: "2027-04-10",
      phvLicenceExpiryYmd: "2027-03-31",
    });
    expect(earliest).toBe("2027-03-31");
    const kpi = summariseDriverLicenceKpi(rows, earliest);
    expect(kpi.value).toBe("Current");
    expect(kpi.detail).toBe("Next expiry 31/03/2027");
  });
});

describe("mapDriverDashboardNextSteps", () => {
  it("rewrites insurance copy and due amount", () => {
    const steps = mapDriverDashboardNextSteps(
      [
        {
          key: "lifecycle:awaiting_insurance_upload",
          title: "Upload hire insurance",
          detail: "Awaiting upload",
          href: "/driver/hires/h1/details",
          warn: true,
          icon: "insurance",
        },
      ],
      110,
      "/driver/hires/h1/payments",
    );
    expect(steps[0]?.title).toBe("Upload your insurance document");
    expect(steps.some((s) => s.title === "£110.00 is due now")).toBe(true);
  });
});

describe("buildDriverDashboardPayload", () => {
  it("builds hero and KPI cards for an active hire", () => {
    const payload = buildDriverDashboardPayload({
      displayName: "Mujtaba Driver",
      drivingLicenceExpiryYmd: "2027-04-10",
      phvLicenceExpiryYmd: "2027-03-31",
      unreadNotifications: 11,
      activeHire: {
        hireGroupId: "h1",
        status: "active",
        statusLabel: "Active",
        vehicleVrm: "KE18 FSX",
        vehicleMakeModel: "Toyota Prius",
        companyName: "Select Me Ltd",
        startedAtOrYmd: "2026-08-10",
        fullySigned: true,
        rentCadence: "daily",
      },
      currentlyDueGbp: 110,
      depositOutstandingGbp: 100,
      rentOutstandingGbp: 10,
      nextDueAmountGbp: 10,
      nextDuePeriodStartYmd: "2026-08-15",
      actionItems: [],
      recentNotifications: [
        {
          id: "n1",
          title: "Payment approved",
          body: "Your £100.00 payment for KE18 FSX was approved.",
          href: "/driver/hires/h1/payments",
          createdAt: "2026-07-29T12:00:00Z",
        },
      ],
      now: new Date("2026-08-14T12:00:00Z"),
    });

    expect(payload.greetingName).toBe("Mujtaba");
    expect(payload.activeHire?.vrmInitials).toBe("KE");
    expect(payload.activeHire?.fullySigned).toBe(true);
    expect(payload.kpis[0]?.value).toBe("£110.00");
    expect(payload.kpis[0]?.detail).toBe("£100.00 deposit + £10.00 rent");
    expect(payload.kpis[3]?.value).toBe("11");
    expect(payload.updates).toHaveLength(1);
  });
});
