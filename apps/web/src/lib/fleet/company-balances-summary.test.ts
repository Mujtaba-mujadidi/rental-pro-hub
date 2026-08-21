import { describe, expect, it } from "vitest";
import {
  activeHireAccountFinancials,
  buildCompanyBalancesAccountRows,
  buildCompanyBalancesKpis,
  buildCompanyBalancesPage,
  chaseableScheduleRentGbp,
  companyBalancesAccountsForTab,
  companyBalancesKpiSubtext,
  companyBalancesPeriodLabel,
  defaultCompanyBalancesTab,
  endedHireAccountFinancials,
  filterCompanyBalancesAccounts,
  hireNeedsLiveBalanceFacts,
  parseHireBalanceSnapshotFromTermination,
  pendingApprovalAmountGbp,
  type CompanyBalancesExtraChargeFact,
  type CompanyBalancesHireFact,
  type CompanyBalancesScheduleFact,
  type CompanyBalancesSettlementPaymentFact,
} from "@/lib/fleet/company-balances-summary";

function hire(
  partial: Partial<CompanyBalancesHireFact> & Pick<CompanyBalancesHireFact, "id" | "status">,
): CompanyBalancesHireFact {
  return {
    subcompanyId: "sub1",
    subcompanyName: "Select Me Ltd",
    vehicleVrm: "KE18 FSX",
    vehicleMake: "Toyota",
    vehicleModel: "Prius",
    driverLabel: "driver@example.com",
    startDateYmd: "2026-08-10",
    activatedAtYmd: "2026-08-10",
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
    subcompanyId: "sub1",
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
  it("builds active account financials from rent due, paid and extras", () => {
    const financials = activeHireAccountFinancials({
      scheduleRows: [
        schedule({
          scheduleRowId: "s1",
          hireGroupId: "active1",
          periodStart: "2026-08-10",
          periodEnd: "2026-08-16",
          baseAmountGbp: 100,
        }),
        schedule({
          scheduleRowId: "s2",
          hireGroupId: "active1",
          periodStart: "2026-08-17",
          periodEnd: "2026-08-17",
          baseAmountGbp: 10,
          discountTotalGbp: 3,
        }),
      ],
      extraCharges: [{ amountGbp: 40, resolution: "add_to_balance" }],
      balancePayments: [
        {
          id: "p1",
          hireGroupId: "active1",
          amountGbp: 15,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
          paidAt: "2026-08-17T10:00:00Z",
          vehicleVrm: "KE18 FSX",
          driverLabel: "driver@example.com",
        },
      ],
      todayYmd: "2026-08-17",
    });

    expect(financials.chargesGbp).toBe(147);
    expect(financials.receivedGbp).toBe(15);
    expect(financials.balanceGbp).toBe(132);
  });

  it("lists active hire accounts with vehicle, subcompany and period label", () => {
    const rows = buildCompanyBalancesAccountRows({
      hires: [hire({ id: "active1", status: "active" })],
      scheduleRows: [
        schedule({
          scheduleRowId: "s1",
          hireGroupId: "active1",
          periodStart: "2026-08-10",
          periodEnd: "2026-08-16",
          baseAmountGbp: 100,
        }),
      ],
      extraChargesByHireId: new Map([["active1", [{ amountGbp: 40, resolution: "add_to_balance" }]]]),
      balancePaymentsByHireId: new Map([
        [
          "active1",
          [
            {
              id: "p1",
              hireGroupId: "active1",
              amountGbp: 15,
              direction: "received_from_driver",
              paymentCategory: "driver_charge",
              paidAt: "2026-08-17T10:00:00Z",
              vehicleVrm: "KE18 FSX",
              driverLabel: "driver@example.com",
            },
          ],
        ],
      ]),
      pendingExtraByHireId: new Map(),
      todayYmd: "2026-08-17",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vehicleVrm: "KE18 FSX",
      subcompanyName: "Select Me Ltd",
      statusLabel: "Active account",
      href: "/rental/balances/active1",
    });
    expect(companyBalancesPeriodLabel(hire({ id: "active1", status: "active" }))).toBe(
      "10 Aug 2026 — ongoing",
    );
  });

  it("matches KPI totals to account rows and pending submissions", () => {
    const page = buildCompanyBalancesPage({
      hires: [
        hire({ id: "active1", status: "active", vehicleVrm: "KE18 FSX" }),
        hire({
          id: "active2",
          status: "active",
          vehicleVrm: "AF67 OEC",
          driverLabel: "other@example.com",
        }),
        hire({
          id: "ended1",
          status: "completed",
          terminatedAtYmd: "2026-08-01",
          settlementBalanceDirection: "settled",
        }),
      ],
      scheduleRows: [
        schedule({
          scheduleRowId: "s1",
          hireGroupId: "active1",
          periodStart: "2026-08-10",
          periodEnd: "2026-08-16",
          baseAmountGbp: 100,
          approvedAmountGbp: 32,
          paymentStatus: "approved",
        }),
        schedule({
          scheduleRowId: "s2",
          hireGroupId: "active2",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          baseAmountGbp: 900,
          approvedAmountGbp: 0,
        }),
        schedule({
          scheduleRowId: "p1",
          hireGroupId: "active1",
          periodStart: "2026-08-17",
          periodEnd: "2026-08-17",
          paymentStatus: "pending_approval",
          pendingSubmittedGbp: 80,
          baseAmountGbp: 110,
        }),
      ],
      extraChargesByHireId: new Map([
        ["active1", [{ amountGbp: 40, resolution: "add_to_balance" }]],
        ["active2", [{ amountGbp: 25, resolution: "add_to_balance" }]],
      ]),
      balancePaymentsByHireId: new Map([
        [
          "active1",
          [
            {
              id: "p1",
              hireGroupId: "active1",
              amountGbp: 15,
              direction: "received_from_driver",
              paymentCategory: "driver_charge",
              paidAt: "2026-08-17T10:00:00Z",
              vehicleVrm: "KE18 FSX",
              driverLabel: "driver@example.com",
            },
          ],
        ],
      ]),
      pendingExtraByHireId: new Map([["active2", 25]]),
      subcompanies: [{ id: "sub1", name: "Select Me Ltd" }],
      todayYmd: "2026-08-17",
    });

    expect(page.kpis.activeHireAccountCount).toBe(2);
    expect(page.kpis.pendingReviewSubmissionCount).toBe(2);
    expect(page.kpis.finalSettlementsCount).toBe(1);
    expect(page.kpis.outstandingAcrossHiresGbp).toBe(
      page.accountRows
        .filter((row) => row.accountStatus === "active" || row.accountStatus === "payment_review")
        .reduce((sum, row) => sum + row.balanceGbp, 0),
    );
    expect(defaultCompanyBalancesTab(page.kpis)).toBe("payment_review");
    expect(companyBalancesKpiSubtext(page.kpis).pendingReview).toBe("2 submissions need approval");
  });

  it("filters tabs, search and subcompany scope for the redesigned table", () => {
    const rows = buildCompanyBalancesAccountRows({
      hires: [
        hire({ id: "active1", status: "active", vehicleVrm: "KE18 FSX" }),
        hire({
          id: "ended1",
          status: "completed",
          terminatedAtYmd: "2026-08-01",
          settlementBalanceDirection: "settled",
          vehicleVrm: "OLD1",
        }),
      ],
      scheduleRows: [
        schedule({
          scheduleRowId: "s1",
          hireGroupId: "active1",
          periodStart: "2026-08-10",
          periodEnd: "2026-08-16",
          baseAmountGbp: 100,
        }),
      ],
      extraChargesByHireId: new Map(),
      balancePaymentsByHireId: new Map(),
      pendingExtraByHireId: new Map(),
      todayYmd: "2026-08-17",
    });

    expect(companyBalancesAccountsForTab(rows, "active")).toHaveLength(1);
    expect(companyBalancesAccountsForTab(rows, "final_settlements")).toHaveLength(1);
    expect(
      filterCompanyBalancesAccounts({
        rows,
        search: "ke18",
        subcompanyId: null,
      }),
    ).toHaveLength(1);
  });

  it("keeps confirmed outstanding balance while pending submissions are shown separately", () => {
    const pendingGbp = pendingApprovalAmountGbp(
      schedule({
        scheduleRowId: "p1",
        hireGroupId: "active1",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        paymentStatus: "pending_approval",
        pendingSubmittedGbp: 80,
        baseAmountGbp: 110,
      }),
    );
    expect(pendingGbp).toBe(80);

    const rows = buildCompanyBalancesAccountRows({
      hires: [hire({ id: "active1", status: "active" })],
      scheduleRows: [
        schedule({
          scheduleRowId: "p1",
          hireGroupId: "active1",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          paymentStatus: "pending_approval",
          pendingSubmittedGbp: 80,
          baseAmountGbp: 110,
        }),
      ],
      extraChargesByHireId: new Map<string, CompanyBalancesExtraChargeFact[]>(),
      balancePaymentsByHireId: new Map<string, CompanyBalancesSettlementPaymentFact[]>(),
      pendingExtraByHireId: new Map<string, number>(),
      todayYmd: "2026-08-17",
    });

    // Pending never reduces the confirmed open balance; chaseable shortfall stays available via helpers.
    expect(rows[0]?.balanceGbp).toBe(110);
    expect(rows[0]?.pendingReviewGbp).toBe(80);
    expect(
      chaseableScheduleRentGbp(
        schedule({
          scheduleRowId: "p1",
          hireGroupId: "active1",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          paymentStatus: "pending_approval",
          pendingSubmittedGbp: 80,
          baseAmountGbp: 110,
        }),
        "2026-08-17",
      ),
    ).toBe(30);
    const kpis = buildCompanyBalancesKpis({
      accountRows: rows,
      activityRows: [],
      pendingReviewSubmissionCount: 1,
    });
    expect(kpis.pendingReviewGbp).toBe(80);
    expect(kpis.outstandingAcrossHiresGbp).toBe(110);
  });

  it("does not double-count paid_now damage cash on ended hire Received", () => {
    const financials = endedHireAccountFinancials({
      hire: hire({
        id: "f547",
        status: "completed",
        terminatedAtYmd: "2026-08-20",
        settlementBalanceDirection: "driver_owes_company",
        settlementOpenBalanceGbp: 500,
      }),
      scheduleRows: [
        schedule({
          scheduleRowId: "r1",
          hireGroupId: "f547",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-20",
          baseAmountGbp: 400,
          paymentStatus: "not_received",
          approvedAmountGbp: 0,
        }),
        schedule({
          scheduleRowId: "d1",
          hireGroupId: "f547",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-01",
          rowKind: "deposit",
          baseAmountGbp: 400,
          paymentStatus: "not_received",
          approvedAmountGbp: 0,
        }),
      ],
      extraCharges: [
        { amountGbp: 100, resolution: "paid_now" },
        { amountGbp: 100, resolution: "add_to_balance" },
      ],
      balancePayments: [
        {
          id: "pn1",
          hireGroupId: "f547",
          amountGbp: 100,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
          paidAt: "2026-08-20T12:00:00Z",
          vehicleVrm: "KE18 FSX",
          driverLabel: "driver@example.com",
        },
      ],
      todayYmd: "2026-08-21",
    });

    expect(financials.chargesGbp).toBe(600);
    expect(financials.receivedGbp).toBe(100);
    expect(financials.balanceGbp).toBe(500);
  });

  it("skips live facts for settled ended hires and uses the termination snapshot", () => {
    expect(
      hireNeedsLiveBalanceFacts({
        status: "active",
        settlementBalanceDirection: null,
      }),
    ).toBe(true);
    expect(
      hireNeedsLiveBalanceFacts({
        status: "completed",
        settlementBalanceDirection: "driver_owes_company",
      }),
    ).toBe(true);
    expect(
      hireNeedsLiveBalanceFacts({
        status: "completed",
        settlementBalanceDirection: "settled",
      }),
    ).toBe(false);

    expect(
      parseHireBalanceSnapshotFromTermination({
        totalDueGbp: 420.4,
        totalPaidGbp: 420.4,
      }),
    ).toEqual({ chargesGbp: 420.4, receivedGbp: 420.4 });

    const rows = buildCompanyBalancesAccountRows({
      hires: [
        hire({
          id: "ended1",
          status: "completed",
          terminatedAtYmd: "2026-08-01",
          settlementBalanceDirection: "settled",
          snapshotChargesGbp: 420.4,
          snapshotReceivedGbp: 400,
        }),
      ],
      scheduleRows: [
        schedule({
          scheduleRowId: "historic",
          hireGroupId: "ended1",
          periodStart: "2026-01-01",
          periodEnd: "2026-01-07",
          baseAmountGbp: 999,
        }),
      ],
      extraChargesByHireId: new Map(),
      balancePaymentsByHireId: new Map(),
      pendingExtraByHireId: new Map(),
      todayYmd: "2026-08-17",
    });

    expect(rows[0]).toMatchObject({
      chargesGbp: 420.4,
      receivedGbp: 400,
      balanceGbp: 0,
      accountStatus: "settled",
    });
  });
});
