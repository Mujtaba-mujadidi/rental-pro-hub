import { describe, expect, it } from "vitest";
import {
  countVehicleHires,
  daysSinceVehicleAdded,
  hireDurationDays,
  hireFactYmd,
  hireOnHireEndYmd,
  hireOnHireStartYmd,
  hireUtilisationPercent,
  outstandingDriverOwesGbp,
  pickCurrentOpenHireId,
  settlementTablePill,
  sumVehicleHireDays,
  vehicleHireDayWindow,
  vehicleHiresAmountDueGbp,
} from "@/lib/fleet/vehicle-hires-page";
import type { DashboardHireFact, DashboardScheduleFact } from "@/lib/fleet/company-dashboard-display";

function hireFact(partial: Partial<DashboardHireFact> & Pick<DashboardHireFact, "id" | "status">): DashboardHireFact {
  return {
    vehicleId: "v1",
    subcompanyId: "s1",
    startDateYmd: "2026-08-01",
    activatedAtYmd: "2026-08-01",
    endedAtYmd: null,
    terminatedAtYmd: null,
    rentAmountGbp: 45,
    rentCadence: "daily",
    unsignedAgreementCount: 0,
    insuranceStatus: "none",
    settlementBalanceDirection: "settled",
    settlementOpenBalanceGbp: 0,
    rentBillingMode: null,
    ...partial,
  };
}

describe("pickCurrentOpenHireId", () => {
  it("prefers active over draft", () => {
    expect(
      pickCurrentOpenHireId([
        { id: "d1", status: "draft", updated_at: "2026-08-16T12:00:00Z" },
        { id: "a1", status: "active", updated_at: "2026-08-01T12:00:00Z" },
      ]),
    ).toBe("a1");
  });

  it("returns null when none open", () => {
    expect(pickCurrentOpenHireId([{ id: "c1", status: "completed" }])).toBeNull();
  });
});

describe("hire day window (dashboard-aligned)", () => {
  it("counts inclusive days for a completed hire", () => {
    expect(
      hireDurationDays(
        {
          status: "completed",
          start_date: "2026-05-01",
          activated_at: "2026-05-01T09:00:00Z",
          ended_at: "2026-05-03T18:00:00Z",
          terminated_at: null,
        },
        "2026-08-16",
      ),
    ).toBe(3);
  });

  it("uses today for open non-draft hires without an end", () => {
    expect(
      hireOnHireStartYmd({
        status: "reserved",
        start_date: "2026-08-10",
        activated_at: null,
        ended_at: null,
        terminated_at: null,
      }),
    ).toBe("2026-08-10");
    expect(
      hireOnHireEndYmd(
        {
          status: "reserved",
          start_date: "2026-08-10",
          activated_at: null,
          ended_at: null,
          terminated_at: null,
        },
        "2026-08-16",
      ),
    ).toBe("2026-08-16");
  });

  it("ignores drafts", () => {
    expect(
      vehicleHireDayWindow(
        {
          status: "draft",
          start_date: "2026-08-01",
          activated_at: null,
          ended_at: null,
          terminated_at: null,
        },
        "2026-08-16",
      ),
    ).toBeNull();
  });

  it("sums across rows", () => {
    expect(
      sumVehicleHireDays(
        [
          {
            status: "completed",
            start_date: "2026-01-01",
            activated_at: "2026-01-01T00:00:00Z",
            ended_at: "2026-01-02T00:00:00Z",
            terminated_at: null,
          },
          {
            status: "active",
            start_date: "2026-08-15",
            activated_at: "2026-08-15T00:00:00Z",
            ended_at: null,
            terminated_at: null,
          },
        ],
        "2026-08-16",
      ),
    ).toBe(4);
  });

  it("reads London calendar day from timestamptz", () => {
    // 2026-08-10 23:30 UTC = 2026-08-11 00:30 London (BST)
    expect(hireFactYmd("2026-08-10T23:30:00.000Z")).toBe("2026-08-11");
  });
});

describe("counts, utilisation, outstanding", () => {
  it("excludes drafts from total hires", () => {
    expect(countVehicleHires(["draft", "active", "completed", "pending_signature"])).toBe(3);
  });

  it("computes utilisation capped to days since added", () => {
    expect(daysSinceVehicleAdded("2026-08-01T12:00:00Z", "2026-08-10")).toBe(10);
    expect(hireUtilisationPercent(5, 10)).toBe(50);
    expect(hireUtilisationPercent(50, 10)).toBe(100);
    expect(hireUtilisationPercent(0, 0)).toBeNull();
  });

  it("sums settlement balances drivers still owe", () => {
    expect(
      outstandingDriverOwesGbp([
        { settlement_balance_direction: "settled", settlement_balance_gbp: 0 },
        { settlement_balance_direction: "driver_owes_company", settlement_balance_gbp: 40.5 },
        { settlement_balance_direction: "company_owes_driver", settlement_balance_gbp: 20 },
        { settlement_balance_direction: "driver_owes_company", settlement_balance_gbp: 9.5 },
      ]),
    ).toBe(50);
  });

  it("includes open-hire accrued rent in amount due", () => {
    const hires = [hireFact({ id: "h1", status: "active", settlementBalanceDirection: "settled" })];
    const scheduleRows: DashboardScheduleFact[] = [
      {
        hireGroupId: "h1",
        vehicleId: "v1",
        subcompanyId: "s1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        rowKind: "rent",
        paymentStatus: "not_received",
        approvedAmountGbp: null,
        baseAmountGbp: 100,
        discountTotalGbp: 0,
      },
    ];
    expect(vehicleHiresAmountDueGbp({ hires, scheduleRows, todayYmd: "2026-08-16" })).toBe(100);
  });

  it("builds settlement pills from stored direction", () => {
    expect(settlementTablePill("settled", 0)).toEqual({ label: "Settled", tone: "success" });
    expect(settlementTablePill("driver_owes_company", 12)).toEqual({
      label: "Driver owes £12.00",
      tone: "warning",
    });
  });
});
