import { describe, expect, it } from "vitest";
import { defaultNotificationSettings } from "@/lib/settings/notification-settings";
import { resolveCompanyDashboardPeriod } from "@/lib/fleet/company-dashboard-period";
import {
  buildCompanyDashboardPayload,
  computeDashboardAmountDue,
  computeDashboardOverdueByHire,
  dashboardChangePct,
  dashboardProfitMarginPct,
  endedHireDriverOwesCompanyGbp,
  fleetUtilisationPct,
  groupDashboardActivityItems,
  hireDaysInPeriod,
  maintenanceInWindowGbp,
  rentAmountToDailyGbp,
  scheduleRowPaidInWindowGbp,
  type BuildCompanyDashboardInput,
  type DashboardHireFact,
  type DashboardMaintenanceFact,
  type DashboardScheduleFact,
  type DashboardVehicleFact,
} from "@/lib/fleet/company-dashboard-display";

function period() {
  const resolved = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd: "2026-08-14" });
  if ("error" in resolved) throw new Error(resolved.error);
  return resolved;
}

function vehicle(partial: Partial<DashboardVehicleFact> & Pick<DashboardVehicleFact, "id" | "subcompanyId">): DashboardVehicleFact {
  return {
    vrm: "AF67 OEC",
    make: "Mercedes-Benz",
    model: "E300",
    status: "on_rent",
    subcompanyName: "Regal",
    motExpiry: "2027-01-01",
    taxExpiry: "2027-01-01",
    phvLicenceExpiry: "2027-01-01",
    gpsPrimaryImei: "123",
    presentDocTypes: ["mot", "logbook", "phv_taxi_licence_paper", "insurance"],
    purchaseGbp: 10000,
    ...partial,
  };
}

function hire(partial: Partial<DashboardHireFact> & Pick<DashboardHireFact, "id" | "vehicleId" | "subcompanyId">): DashboardHireFact {
  return {
    status: "active",
    startDateYmd: "2026-08-01",
    activatedAtYmd: "2026-08-01",
    endedAtYmd: null,
    terminatedAtYmd: null,
    rentAmountGbp: 280,
    rentCadence: "weekly",
    unsignedAgreementCount: 0,
    insuranceStatus: "ok",
    settlementBalanceDirection: null,
    settlementOpenBalanceGbp: 0,
    rentBillingMode: null,
    ...partial,
  };
}

function baseInput(overrides: Partial<BuildCompanyDashboardInput> = {}): BuildCompanyDashboardInput {
  const vehicles: DashboardVehicleFact[] = [
    vehicle({ id: "v1", subcompanyId: "s1", status: "on_rent", vrm: "AF67 OEC" }),
    vehicle({ id: "v2", subcompanyId: "s1", status: "available", vrm: "BX12 ABC", purchaseGbp: 5000 }),
    vehicle({ id: "v3", subcompanyId: "s2", status: "on_rent", vrm: "CD34 DEF", subcompanyName: "Select" }),
  ];
  const hires: DashboardHireFact[] = [
    hire({ id: "h1", vehicleId: "v1", subcompanyId: "s1" }),
  ];
  const scheduleRows: DashboardScheduleFact[] = [
    {
      hireGroupId: "h1",
      vehicleId: "v1",
      subcompanyId: "s1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      rowKind: "rent",
      paymentStatus: "approved",
      approvedAmountGbp: 280,
      baseAmountGbp: 280,
      discountTotalGbp: 0,
    },
    {
      hireGroupId: "h1",
      vehicleId: "v1",
      subcompanyId: "s1",
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26",
      rowKind: "rent",
      paymentStatus: "approved",
      approvedAmountGbp: 200,
      baseAmountGbp: 200,
      discountTotalGbp: 0,
    },
  ];
  const maintenance: DashboardMaintenanceFact[] = [
    { vehicleId: "v1", subcompanyId: "s1", occurredOn: "2026-08-05", amountGbp: 50 },
    { vehicleId: "v1", subcompanyId: "s1", occurredOn: "2026-07-22", amountGbp: 30 },
  ];

  return {
    companyName: "Demo Co",
    period: period(),
    todayYmd: "2026-08-14",
    selectedSubcompanyId: null,
    subcompanies: [
      { id: "s1", name: "Regal", isPrimary: true },
      { id: "s2", name: "Select", isPrimary: false },
    ],
    vehicles,
    hires,
    scheduleRows,
    maintenance,
    activity: [],
    notifySettings: defaultNotificationSettings(),
    canWriteRentals: true,
    canManageFleet: true,
    canManageFleetTracking: true,
    ...overrides,
  };
}

describe("dashboard calculation helpers", () => {
  it("computes margin, change and utilisation", () => {
    expect(dashboardProfitMarginPct(1000, 250)).toBe(25);
    expect(dashboardProfitMarginPct(0, 10)).toBeNull();
    expect(dashboardChangePct(110, 100)).toBe(10);
    expect(dashboardChangePct(50, 0)).toBeNull();
    expect(fleetUtilisationPct(6, 9)).toBe(67);
    expect(rentAmountToDailyGbp(280, "weekly")).toBe(40);
  });

  it("attributes schedule and maintenance into the selected window only", () => {
    const row: DashboardScheduleFact = {
      hireGroupId: "h1",
      vehicleId: "v1",
      subcompanyId: "s1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      rowKind: "rent",
      paymentStatus: "approved",
      approvedAmountGbp: 100,
      baseAmountGbp: 100,
      discountTotalGbp: 0,
    };
    expect(scheduleRowPaidInWindowGbp(row, "2026-08-01", "2026-08-14")).toBe(100);
    expect(scheduleRowPaidInWindowGbp(row, "2026-07-01", "2026-07-31")).toBe(0);
    expect(
      maintenanceInWindowGbp(
        [{ vehicleId: "v1", subcompanyId: "s1", occurredOn: "2026-08-05", amountGbp: 12.5 }],
        "2026-08-01",
        "2026-08-14",
      ),
    ).toBe(12.5);
  });

  it("counts overlapping hire days in the period", () => {
    const row = hire({
      id: "h1",
      vehicleId: "v1",
      subcompanyId: "s1",
      startDateYmd: "2026-07-28",
      activatedAtYmd: "2026-07-28",
      rentAmountGbp: 40,
      rentCadence: "daily",
    });
    expect(hireDaysInPeriod(row, "2026-08-01", "2026-08-14", "2026-08-14")).toBe(14);
  });
});

describe("ended-hire amount due and overdue", () => {
  const endedSchedule: DashboardScheduleFact[] = [
    {
      hireGroupId: "ended1",
      vehicleId: "v1",
      subcompanyId: "s1",
      periodStart: "2026-08-05",
      periodEnd: "2026-08-11",
      rowKind: "rent",
      paymentStatus: "approved",
      approvedAmountGbp: 57.14,
      baseAmountGbp: 100,
      discountTotalGbp: 0,
    },
    {
      hireGroupId: "ended1",
      vehicleId: "v1",
      subcompanyId: "s1",
      periodStart: "2026-08-12",
      periodEnd: "2026-08-18",
      rowKind: "rent",
      paymentStatus: "not_received",
      approvedAmountGbp: null,
      baseAmountGbp: 100,
      discountTotalGbp: 0,
    },
  ];

  it("ignores prorated leftovers and post-end rows when settlement is settled", () => {
    const ended = hire({
      id: "ended1",
      vehicleId: "v1",
      subcompanyId: "s1",
      status: "completed",
      startDateYmd: "2026-07-29",
      activatedAtYmd: "2026-07-29",
      endedAtYmd: "2026-08-08",
      terminatedAtYmd: "2026-08-08",
      rentAmountGbp: 100,
      rentBillingMode: "actual",
      settlementBalanceDirection: "settled",
      settlementOpenBalanceGbp: 0,
    });

    expect(endedHireDriverOwesCompanyGbp(ended, endedSchedule)).toBe(0);
    expect(
      computeDashboardAmountDue({
        hires: [ended],
        scheduleRows: endedSchedule,
        todayYmd: "2026-08-15",
      }).gbp,
    ).toBe(0);
    expect(
      computeDashboardOverdueByHire({
        hires: [ended],
        scheduleRows: endedSchedule,
        todayYmd: "2026-08-15",
      }).size,
    ).toBe(0);
  });

  it("uses actual-days settlement fallback when live settlement columns are missing", () => {
    const ended = hire({
      id: "ended1",
      vehicleId: "v1",
      subcompanyId: "s1",
      status: "completed",
      startDateYmd: "2026-08-05",
      activatedAtYmd: "2026-08-05",
      endedAtYmd: "2026-08-08",
      terminatedAtYmd: "2026-08-08",
      rentAmountGbp: 100,
      rentBillingMode: "actual",
      settlementBalanceDirection: null,
      settlementOpenBalanceGbp: 0,
    });
    // Paid 57.14 against actual due 57.14 → nothing owed.
    expect(endedHireDriverOwesCompanyGbp(ended, endedSchedule)).toBe(0);

    const unpaidActual = hire({
      ...ended,
      id: "ended2",
    });
    const unpaidSchedule: DashboardScheduleFact[] = [
      {
        hireGroupId: "ended2",
        vehicleId: "v1",
        subcompanyId: "s1",
        periodStart: "2026-08-05",
        periodEnd: "2026-08-11",
        rowKind: "rent",
        paymentStatus: "not_received",
        approvedAmountGbp: null,
        baseAmountGbp: 100,
        discountTotalGbp: 0,
      },
    ];
    // 4 of 7 days × £100 = £57.14 still owed under actual billing.
    expect(endedHireDriverOwesCompanyGbp(unpaidActual, unpaidSchedule)).toBe(57.14);

    const unpaidFullPeriod = hire({
      ...unpaidActual,
      rentBillingMode: "end_of_period",
    });
    // Full week still due under end_of_period billing.
    expect(endedHireDriverOwesCompanyGbp(unpaidFullPeriod, unpaidSchedule)).toBe(100);
  });

  it("includes ended-hire open settlement when the driver still owes the company", () => {
    const ended = hire({
      id: "ended1",
      vehicleId: "v1",
      subcompanyId: "s1",
      status: "completed",
      terminatedAtYmd: "2026-08-08",
      endedAtYmd: "2026-08-08",
      rentBillingMode: "end_of_period",
      settlementBalanceDirection: "driver_owes_company",
      settlementOpenBalanceGbp: 40,
    });
    const due = computeDashboardAmountDue({
      hires: [ended],
      scheduleRows: endedSchedule,
      todayYmd: "2026-08-15",
    });
    expect(due.gbp).toBe(40);
    expect(due.alertCount).toBe(1);
    expect(
      computeDashboardOverdueByHire({
        hires: [ended],
        scheduleRows: endedSchedule,
        todayYmd: "2026-08-15",
      }).get("ended1"),
    ).toBe(40);
  });
});

describe("buildCompanyDashboardPayload", () => {
  it("defaults to all-subcompany totals and filters when a subcompany is selected", () => {
    const all = buildCompanyDashboardPayload(baseInput());
    expect(all.selectedSubcompanyName).toBe("All subcompanies");
    expect(all.kpis.revenueGbp).toBe(280);
    expect(all.kpis.operatingCostsGbp).toBe(50);
    expect(all.kpis.netProfitGbp).toBe(230);
    expect(all.fleet.totalVehicles).toBe(3);
    expect(all.fleet.onHire).toBe(2);
    expect(all.comparison).toHaveLength(2);

    const filtered = buildCompanyDashboardPayload(baseInput({ selectedSubcompanyId: "s1" }));
    expect(filtered.selectedSubcompanyName).toBe("Regal");
    expect(filtered.fleet.totalVehicles).toBe(2);
    expect(filtered.fleet.onHire).toBe(1);
    expect(filtered.kpis.revenueGbp).toBe(280);
    expect(filtered.mostProfitableVehicles[0]?.vrm).toBe("AF67 OEC");
  });

  it("builds attention items for expired MOT and overdue rent", () => {
    const payload = buildCompanyDashboardPayload(
      baseInput({
        vehicles: [
          vehicle({
            id: "v1",
            subcompanyId: "s1",
            motExpiry: "2026-08-01",
            presentDocTypes: ["logbook", "phv_taxi_licence_paper"],
            gpsPrimaryImei: null,
          }),
        ],
        scheduleRows: [
          {
            hireGroupId: "h1",
            vehicleId: "v1",
            subcompanyId: "s1",
            periodStart: "2026-07-01",
            periodEnd: "2026-07-07",
            rowKind: "rent",
            paymentStatus: "not_received",
            approvedAmountGbp: null,
            baseAmountGbp: 110,
            discountTotalGbp: 0,
          },
        ],
      }),
    );
    expect(payload.attention.some((a) => a.title.includes("MOT"))).toBe(true);
    expect(payload.attention.some((a) => a.title.includes("Payment overdue"))).toBe(true);
    expect(payload.attention.some((a) => a.title.includes("Tracking device"))).toBe(true);
    expect(payload.kpis.amountDueGbp).toBe(110);
    const overdue = payload.attention.find((a) => a.title.includes("Payment overdue"));
    expect(overdue?.href).toBe("/rental/hires/h1/payments");
  });

  it("groups duplicate activity facts by day", () => {
    const items = groupDashboardActivityItems([
      {
        id: "1",
        at: "2026-08-14T10:00:00Z",
        title: "Payment approved",
        detail: "Rent payment approved",
        href: "/rental/balances/h1",
        groupKey: "payment:h1",
      },
      {
        id: "2",
        at: "2026-08-14T11:00:00Z",
        title: "Payment approved",
        detail: "Rent payment approved",
        href: "/rental/balances/h1",
        groupKey: "payment:h1",
      },
      {
        id: "3",
        at: "2026-08-13T09:00:00Z",
        title: "Hire started",
        detail: "Checkout completed",
        href: "/rental/hires/h1",
        groupKey: "hire:h1",
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.detail).toContain("2 related updates");
  });
});
