import { describe, expect, it } from "vitest";
import {
  formatHireSettlementLedgerDate,
  formatHireSettlementSignedAmount,
  hireBalanceCompanyLine,
  hireBalanceHeroSubtext,
  hireBalancePeriodLine,
  hireBalanceReference,
  hireBalanceStatusLabel,
  hireSettlementChargeActivityTitle,
  hireSettlementKpiHints,
  hireSettlementOpeningDetail,
  hireSettlementPaymentActivityDetail,
  hireSettlementPaymentActivityTitle,
  newestFirstHireSettlementRows,
  hireStatementLedgerRowsForDisplay,
  buildHireBalanceAccountStatementContent,
} from "./hire-settlement-balance-display";
import type { HireSettlementLedgerRow } from "./hire-settlement-statement";

function row(partial: Partial<HireSettlementLedgerRow> & Pick<HireSettlementLedgerRow, "id">): HireSettlementLedgerRow {
  return {
    kind: "charge",
    sortAt: "2026-08-01T00:00:00.000Z",
    dateYmd: "2026-08-01",
    occurredAt: "2026-08-01T00:00:00.000Z",
    activity: "Charge",
    activityTitle: "Charge",
    activityDetail: null,
    status: "posted",
    typeLabel: "Damage",
    signedAmountGbp: 10,
    runningBalanceGbp: 10,
    ...partial,
  };
}

describe("hire settlement balance display", () => {
  it("builds a compact balance reference from VRM and year", () => {
    expect(hireBalanceReference("AJ17 KUN", "2026-08-01")).toBe("BAL-AJ17KUN-26");
    expect(hireBalanceReference("KE18 FSX", "2026-08-08T13:24:00Z")).toBe("BAL-KE18FSX-26");
  });

  it("labels open and closed statuses", () => {
    expect(hireBalanceStatusLabel(false)).toBe("Open balance");
    expect(hireBalanceStatusLabel(true)).toBe("Closed");
  });

  it("builds the period line for active and ended hires", () => {
    expect(
      hireBalancePeriodLine({
        vehicleVrm: "AJ17 KUN",
        ended: false,
        startedAt: "2026-08-01",
        terminatedAt: null,
      }),
    ).toBe("AJ17 KUN · Active driver · 01/08/2026 — ongoing");
    expect(
      hireBalancePeriodLine({
        vehicleVrm: "KE18 FSX",
        ended: true,
        startedAt: "2026-07-01",
        terminatedAt: "2026-08-08T12:24:00.000Z",
        driverLabel: "driver@example.com",
      }),
    ).toBe("KE18 FSX · driver@example.com · 01/07/2026 – 08/08/2026");
    expect(hireBalanceCompanyLine("OXUS CARS LTD", true)).toBe("This hire was with OXUS CARS LTD");
    expect(hireBalanceCompanyLine("Select Me Ltd", false)).toBe("Select Me Ltd");
  });

  it("titles extra charges and payments like the statement", () => {
    expect(hireSettlementChargeActivityTitle("damage")).toBe("Damage charge");
    expect(hireSettlementChargeActivityTitle("administration")).toBe("Administration charge");
    expect(hireSettlementChargeActivityTitle("rent")).toBe("Hire rent");
    expect(hireSettlementPaymentActivityTitle("bank_transfer")).toBe("Bank transfer");
    expect(
      hireSettlementPaymentActivityDetail({
        notes: null,
        paymentReference: "RPH-8147",
        paymentCategory: "settlement",
        paymentMethod: "bank_transfer",
      }),
    ).toBe("Bank transfer · RPH-8147");
    expect(
      hireSettlementOpeningDetail({
        accruedRentDueGbp: 70,
        accruedRentPaidGbp: 412.86,
        depositGbp: 100,
      }),
    ).toBe("Rent due £70.00 · Rent paid £412.86 · Deposit £100.00");
  });

  it("formats statement ledger dates as UK date and time", () => {
    expect(
      formatHireSettlementLedgerDate(
        row({
          id: "ts",
          dateYmd: "2026-08-31",
          occurredAt: "2026-08-31T11:43:00.000Z",
        }),
      ),
    ).toBe("31 Aug, 12:43");
    expect(
      formatHireSettlementLedgerDate(
        row({
          id: "day",
          dateYmd: "2026-08-10",
          occurredAt: "2026-08-10",
        }),
      ),
    ).toBe("10 Aug 2026");
  });

  it("shows newest ledger rows first without changing running balances", () => {
    const newestFirst = newestFirstHireSettlementRows([
      row({ id: "a", runningBalanceGbp: 315 }),
      row({ id: "b", runningBalanceGbp: 465 }),
    ]);
    expect(newestFirst.map((item) => item.id)).toEqual(["b", "a"]);
    expect(newestFirst[0]?.runningBalanceGbp).toBe(465);
  });

  it("rebuilds running balance in date order for the visible statement filter", () => {
    const displayed = hireStatementLedgerRowsForDisplay(
      [
        row({ id: "c1", kind: "charge", signedAmountGbp: 10, runningBalanceGbp: 10 }),
        row({ id: "p1", kind: "payment", signedAmountGbp: -4, runningBalanceGbp: 6 }),
        row({ id: "c2", kind: "charge", signedAmountGbp: 10, runningBalanceGbp: 16 }),
      ],
      "charges",
    );
    expect(displayed.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(displayed.map((item) => item.runningBalanceGbp)).toEqual([10, 20]);
  });

  it("builds a printable account statement from ledger rows", () => {
    const content = buildHireBalanceAccountStatementContent({
      vehicleVrm: "AJ17 KUN",
      driverLabel: "Alex Driver",
      balanceReference: "BAL-AJ17KUN-26",
      currentBalanceGbp: 20,
      rows: [
        row({ id: "c1", signedAmountGbp: 10, runningBalanceGbp: 10, activityTitle: "Hire rent" }),
        row({
          id: "p1",
          kind: "payment",
          signedAmountGbp: -4,
          runningBalanceGbp: 6,
          activityTitle: "Bank transfer",
        }),
      ],
    });
    expect(content.fileName).toBe("account-statement-AJ17KUN-BAL-AJ17KUN-26.pdf");
    expect(content.sections[0]?.lines).toEqual([
      "Reference: BAL-AJ17KUN-26",
      "Vehicle: AJ17 KUN",
      "Driver: Alex Driver",
      "Current balance: £20.00",
    ]);
    expect(content.sections[1]?.lines[0]).toContain("Hire rent");
    expect(content.sections[1]?.lines[0]).toContain("+£10.00");
  });

  it("formats signed amounts and KPI hints", () => {
    expect(formatHireSettlementSignedAmount(25)).toBe("+£25.00");
    expect(formatHireSettlementSignedAmount(-105)).toBe("−£105.00");
    expect(
      hireSettlementKpiHints({
        totalChargesGbp: 570,
        approvedPaymentsGbp: 105,
        refundsToDriverGbp: 0,
        pendingPaymentsGbp: 0,
        currentBalanceGbp: 465,
        currentDirection: "driver_owes_company",
      }).currentBalance,
    ).toBe("Driver still owes the company");
    expect(
      hireBalanceHeroSubtext({
        settled: true,
        approvedPaymentsGbp: 0,
        refundsToDriverGbp: 342.86,
        settlementDirection: "settled",
      }),
    ).toBe("Closed after £342.86 refunded to the driver");
  });
});
