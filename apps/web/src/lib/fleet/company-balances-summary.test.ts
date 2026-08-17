import { describe, expect, it } from "vitest";
import {
  buildCompanyBalancesKpis,
  buildCompanyBalancesOpenRows,
  buildCompanyBalancesPage,
  companyBalancesKpiSubtext,
  defaultCompanyBalancesTab,
  endedHireCompanyOwesDriverGbp,
  type CompanyBalancesHireFact,
  type CompanyBalancesScheduleFact,
  type CompanyBalancesSettlementPaymentFact,
} from "@/lib/fleet/company-balances-summary";

function hire(partial: Partial<CompanyBalancesHireFact> & Pick<CompanyBalancesHireFact, "id" | "status">): CompanyBalancesHireFact {
  return {
    vehicleVrm: "AF67 OEC",
    driverLabel: "driver@example.com",
    settlementBalanceDirection: null,
    settlementOpenBalanceGbp: 0,
    rentBillingMode: "end_of_period",
    rentCadence: "weekly",
    terminatedAtYmd: null,
    endedAtYmd: null,
    ...partial,
  };
}

function schedule(
  partial: Partial<CompanyBalancesScheduleFact> &
    Pick<CompanyBalancesScheduleFact, "scheduleRowId" | "hireGroupId" | "periodStart" | "periodEnd">,
): CompanyBalancesScheduleFact {
  return {
    vehicleId: "",
    subcompanyId: "",
    rowKind: "rent",
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    baseAmountGbp: 110,
    discountTotalGbp: 0,
    pendingSubmittedGbp: null,
    ...partial,
  };
}

describe("company balances summary", () => {
  it("matches driver-due KPI to open rent + settlement rows (same as dashboard amount due)", () => {
    const hires = [
      hire({ id: "active1", status: "active", vehicleVrm: "AB12 CDE" }),
      hire({
        id: "ended1",
        status: "completed",
        terminatedAtYmd: "2026-08-08",
        endedAtYmd: "2026-08-08",
        settlementBalanceDirection: "driver_owes_company",
        settlementOpenBalanceGbp: 40,
        vehicleVrm: "ZZ99 ZZZ",
      }),
    ];
    const scheduleRows = [
      schedule({
        scheduleRowId: "s1",
        hireGroupId: "active1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        baseAmountGbp: 110,
      }),
    ];

    const openRows = buildCompanyBalancesOpenRows({
      hires,
      scheduleRows,
      todayYmd: "2026-08-15",
    });
    const kpis = buildCompanyBalancesKpis({ openRows, activityRows: [] });

    expect(openRows.filter((r) => r.kind === "rent_due" || r.kind === "settlement")).toHaveLength(2);
    expect(kpis.driverPaymentsDueGbp).toBe(150);
    expect(kpis.driverPaymentsDueHireCount).toBe(2);
    expect(kpis.openBalanceGbp).toBe(0);
    expect(defaultCompanyBalancesTab(kpis)).toBe("open");
  });

  it("puts company-owed refunds in Open balance KPI and refund_owed rows", () => {
    const hires = [
      hire({
        id: "ended2",
        status: "terminated",
        terminatedAtYmd: "2026-08-10",
        settlementBalanceDirection: "company_owes_driver",
        settlementOpenBalanceGbp: 25.5,
      }),
    ];
    expect(endedHireCompanyOwesDriverGbp(hires[0]!)).toBe(25.5);

    const openRows = buildCompanyBalancesOpenRows({
      hires,
      scheduleRows: [],
      todayYmd: "2026-08-15",
    });
    const kpis = buildCompanyBalancesKpis({ openRows, activityRows: [] });

    expect(openRows).toEqual([
      expect.objectContaining({
        kind: "refund_owed",
        amountGbp: 25.5,
        href: "/rental/balances/ended2",
      }),
    ]);
    expect(kpis.openBalanceGbp).toBe(25.5);
    expect(kpis.openBalanceHireCount).toBe(1);
    expect(kpis.driverPaymentsDueGbp).toBe(0);
    expect(companyBalancesKpiSubtext(kpis).openBalance).toBe("1 refund");
  });

  it("keeps partial shortfall in driver due while pending covers the submitted amount", () => {
    const hires = [hire({ id: "active1", status: "active" })];
    const scheduleRows = [
      schedule({
        scheduleRowId: "p1",
        hireGroupId: "active1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        paymentStatus: "pending_approval",
        pendingSubmittedGbp: 80,
        baseAmountGbp: 110,
      }),
    ];

    const openRows = buildCompanyBalancesOpenRows({
      hires,
      scheduleRows,
      todayYmd: "2026-08-15",
    });
    const kpis = buildCompanyBalancesKpis({ openRows, activityRows: [] });

    expect(openRows.find((r) => r.kind === "rent_due")?.amountGbp).toBe(30);
    expect(openRows.find((r) => r.kind === "pending_approval")?.amountGbp).toBe(80);
    expect(kpis.driverPaymentsDueGbp).toBe(30);
    expect(kpis.pendingApprovalGbp).toBe(80);
  });

  it("drops fully pending rows from driver due and keeps KPI = row sum", () => {
    const hires = [hire({ id: "active1", status: "active" })];
    const scheduleRows = [
      schedule({
        scheduleRowId: "p1",
        hireGroupId: "active1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        paymentStatus: "pending_approval",
        pendingSubmittedGbp: 110,
        baseAmountGbp: 110,
      }),
      schedule({
        scheduleRowId: "p2",
        hireGroupId: "active1",
        periodStart: "2026-08-08",
        periodEnd: "2026-08-14",
        paymentStatus: "pending_approval",
        pendingSubmittedGbp: 110,
        baseAmountGbp: 110,
      }),
    ];

    const openRows = buildCompanyBalancesOpenRows({
      hires,
      scheduleRows,
      todayYmd: "2026-08-15",
    });
    const pending = openRows.filter((r) => r.kind === "pending_approval");
    const kpis = buildCompanyBalancesKpis({ openRows, activityRows: [] });

    expect(pending).toHaveLength(2);
    expect(kpis.pendingApprovalGbp).toBe(220);
    expect(kpis.pendingApprovalCount).toBe(2);
    expect(kpis.driverPaymentsDueGbp).toBe(0);
    expect(openRows.filter((r) => r.kind === "rent_due")).toHaveLength(0);
    expect(companyBalancesKpiSubtext(kpis).pendingApproval).toBe("2 submissions");
  });

  it("builds collected-this-month from schedule paid + settlement receipts in UK month", () => {
    const hires = [
      hire({ id: "active1", status: "active" }),
      hire({
        id: "ended1",
        status: "completed",
        terminatedAtYmd: "2026-08-01",
        settlementBalanceDirection: "settled",
        settlementOpenBalanceGbp: 0,
      }),
    ];
    const scheduleRows = [
      schedule({
        scheduleRowId: "paid1",
        hireGroupId: "active1",
        periodStart: "2026-08-03",
        periodEnd: "2026-08-09",
        paymentStatus: "approved",
        approvedAmountGbp: 110,
        baseAmountGbp: 110,
      }),
      schedule({
        scheduleRowId: "old",
        hireGroupId: "active1",
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
        paymentStatus: "approved",
        approvedAmountGbp: 110,
      }),
    ];
    const settlementPayments: CompanyBalancesSettlementPaymentFact[] = [
      {
        id: "bp1",
        hireGroupId: "ended1",
        amountGbp: 40,
        direction: "received_from_driver",
        paymentCategory: "settlement",
        paidAt: "2026-08-12T10:00:00Z",
        vehicleVrm: "ZZ99 ZZZ",
        driverLabel: "a@b.com",
      },
      {
        id: "bp2",
        hireGroupId: "ended1",
        amountGbp: 10,
        direction: "paid_to_driver",
        paymentCategory: "settlement",
        paidAt: "2026-08-12T11:00:00Z",
        vehicleVrm: "ZZ99 ZZZ",
        driverLabel: "a@b.com",
      },
    ];

    const page = buildCompanyBalancesPage({
      hires,
      scheduleRows,
      settlementPayments,
      todayYmd: "2026-08-16",
    });

    expect(page.monthStartYmd).toBe("2026-08-01");
    expect(page.monthEndYmd).toBe("2026-08-16");
    expect(page.activityRows).toHaveLength(2);
    expect(page.kpis.collectedThisMonthGbp).toBe(150);
    expect(page.kpis.collectedThisMonthPaymentCount).toBe(2);
    expect(page.settledRows).toHaveLength(1);
    expect(page.kpis.collectedThisMonthGbp).toBe(
      page.activityRows.reduce((sum, row) => sum + row.amountGbp, 0),
    );
  });

  it("does not invent open money when everything is clear", () => {
    const page = buildCompanyBalancesPage({
      hires: [
        hire({
          id: "ended1",
          status: "completed",
          settlementBalanceDirection: "settled",
          terminatedAtYmd: "2026-07-01",
        }),
      ],
      scheduleRows: [],
      settlementPayments: [],
      todayYmd: "2026-08-16",
    });
    expect(page.openRows).toEqual([]);
    expect(page.kpis.driverPaymentsDueGbp).toBe(0);
    expect(page.kpis.openBalanceGbp).toBe(0);
    expect(page.kpis.pendingApprovalGbp).toBe(0);
    expect(page.defaultTab).toBe("settled");
  });

  it("deep-links rent due to hire payments and settlement to balances workspace", () => {
    const openRows = buildCompanyBalancesOpenRows({
      hires: [
        hire({ id: "a1", status: "active" }),
        hire({
          id: "e1",
          status: "terminated",
          settlementBalanceDirection: "driver_owes_company",
          settlementOpenBalanceGbp: 12,
          terminatedAtYmd: "2026-08-01",
        }),
      ],
      scheduleRows: [
        schedule({
          scheduleRowId: "s1",
          hireGroupId: "a1",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          baseAmountGbp: 50,
        }),
      ],
      todayYmd: "2026-08-15",
    });
    expect(openRows.find((r) => r.kind === "rent_due")?.href).toBe("/rental/hires/a1/payments");
    expect(openRows.find((r) => r.kind === "settlement")?.href).toBe("/rental/balances/e1");
  });
});
