import { describe, expect, it } from "vitest";
import {
  activeHireSettlementOpenBalance,
  buildHireSettlementStatement,
  hireActiveRentToSettlementEntries,
} from "./hire-settlement-statement";

describe("buildHireSettlementStatement", () => {
  it("builds running balance that matches KPIs and current signed balance", () => {
    const statement = buildHireSettlementStatement({
      openingNetSettlementGbp: 200,
      openingDateYmd: "2026-08-01",
      charges: [
        {
          id: "c1",
          chargedOn: "2026-08-03",
          createdAt: "2026-08-03T10:00:00Z",
          chargeType: "administration",
          description: "Admin fee",
          amountGbp: 50,
          resolution: "add_to_balance",
        },
      ],
      payments: [
        {
          id: "p1",
          paidAt: "2026-08-04T12:00:00Z",
          amountGbp: 100,
          direction: "received_from_driver",
          paymentCategory: "settlement",
        },
      ],
      pendingScheduleGbp: 20,
      currentDirection: "driver_owes_company",
      currentOpenBalanceGbp: 150,
      mutableChargeIds: new Set(["c1"]),
    });

    expect(statement.kpis.totalChargesGbp).toBe(250);
    expect(statement.kpis.approvedPaymentsGbp).toBe(100);
    expect(statement.kpis.pendingPaymentsGbp).toBe(20);
    expect(statement.kpis.currentBalanceGbp).toBe(150);
    expect(statement.rows).toHaveLength(3);
    expect(statement.rows.at(-1)?.runningBalanceGbp).toBe(150);
    expect(statement.rows.find((row) => row.chargeId === "c1")?.canMutateCharge).toBe(true);
  });

  it("does not let pending schedule reduce the running balance", () => {
    const statement = buildHireSettlementStatement({
      openingNetSettlementGbp: 80,
      openingDateYmd: "2026-08-01",
      charges: [],
      payments: [],
      pendingScheduleGbp: 80,
      currentDirection: "driver_owes_company",
      currentOpenBalanceGbp: 80,
    });
    expect(statement.kpis.pendingPaymentsGbp).toBe(80);
    expect(statement.rows.at(-1)?.runningBalanceGbp).toBe(80);
  });

  it("nets paid_now charges against matching receipts", () => {
    const statement = buildHireSettlementStatement({
      openingNetSettlementGbp: 0,
      openingDateYmd: "2026-08-01",
      charges: [
        {
          id: "c-paid",
          chargedOn: "2026-08-02",
          createdAt: "2026-08-02T10:00:00Z",
          chargeType: "damage",
          description: "Bumper",
          amountGbp: 75,
          resolution: "paid_now",
        },
      ],
      payments: [
        {
          id: "p-paid",
          paidAt: "2026-08-02T12:00:00Z",
          amountGbp: 75,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
        },
      ],
      pendingScheduleGbp: 0,
      currentDirection: "settled",
      currentOpenBalanceGbp: 0,
    });
    expect(statement.kpis.totalChargesGbp).toBe(75);
    expect(statement.kpis.approvedPaymentsGbp).toBe(75);
    expect(statement.rows.at(-1)?.runningBalanceGbp).toBe(0);
  });

  it("posts accrued rent after discount and keeps unpaid rent on the open balance", () => {
    const rent = hireActiveRentToSettlementEntries([
      {
        id: "10",
        rowKind: "rent",
        periodStart: "2026-08-10",
        accrued: true,
        netDueGbp: 10,
        paidGbp: 10,
        discountTotalGbp: 0,
      },
      {
        id: "11",
        rowKind: "rent",
        periodStart: "2026-08-11",
        accrued: true,
        netDueGbp: 10,
        paidGbp: 10,
        discountTotalGbp: 0,
      },
      {
        id: "12",
        rowKind: "rent",
        periodStart: "2026-08-12",
        accrued: true,
        netDueGbp: 7,
        paidGbp: 0,
        discountTotalGbp: 3,
      },
      {
        id: "13-17",
        rowKind: "rent",
        periodStart: "2026-08-13",
        accrued: true,
        netDueGbp: 50,
        paidGbp: 0,
        discountTotalGbp: 0,
      },
      {
        id: "dep",
        rowKind: "deposit",
        periodStart: "2026-08-10",
        accrued: true,
        netDueGbp: 100,
        paidGbp: 100,
        discountTotalGbp: 0,
      },
    ]);
    const open = activeHireSettlementOpenBalance(57, 0);
    const statement = buildHireSettlementStatement({
      openingNetSettlementGbp: 0,
      openingDateYmd: null,
      charges: rent.charges,
      payments: rent.payments,
      pendingScheduleGbp: 0,
      currentDirection: open.openDirection,
      currentOpenBalanceGbp: open.openBalanceGbp,
    });

    expect(open).toEqual({ openBalanceGbp: 57, openDirection: "driver_owes_company" });
    expect(statement.kpis.totalChargesGbp).toBe(77);
    expect(statement.kpis.approvedPaymentsGbp).toBe(20);
    expect(statement.kpis.currentBalanceGbp).toBe(57);
    expect(rent.charges.find((row) => row.id === "rent:12")?.description).toBe("After £3.00 discount");
    expect(rent.charges.some((row) => row.id === "rent:dep")).toBe(false);
  });

  it("shows who owed whom, extra charges, receipts and refunds on an ended hire", () => {
    const statement = buildHireSettlementStatement({
      openingNetSettlementGbp: -442.86,
      openingDateYmd: "2026-08-08",
      openingActivityDetail: "Rent due £70.00 · Rent paid £412.86 · Deposit £100.00",
      charges: [
        {
          id: "damage",
          chargedOn: "2026-08-08",
          createdAt: "2026-08-08T13:30:00Z",
          chargeType: "damage",
          description: "Check-in damage",
          amountGbp: 100,
          resolution: "add_to_balance",
        },
      ],
      payments: [
        {
          id: "r1",
          paidAt: "2026-08-08T14:00:00Z",
          amountGbp: 100,
          direction: "paid_to_driver",
          paymentCategory: "settlement",
          paymentMethod: "bank_transfer",
          paymentReference: "REF-1",
        },
        {
          id: "r2",
          paidAt: "2026-08-08T15:00:00Z",
          amountGbp: 242.86,
          direction: "paid_to_driver",
          paymentCategory: "settlement",
          paymentMethod: "cash",
        },
      ],
      pendingScheduleGbp: 0,
      currentDirection: "settled",
      currentOpenBalanceGbp: 0,
    });

    expect(statement.rows[0]?.activityTitle).toBe("Company owed driver at contract end");
    expect(statement.rows[0]?.activityDetail).toContain("Deposit £100.00");
    expect(statement.rows.find((row) => row.chargeId === "damage")?.activityTitle).toBe("Damage charge");
    expect(statement.rows.filter((row) => row.typeLabel === "Refund")).toHaveLength(2);
    expect(statement.kpis.totalChargesGbp).toBe(100);
    expect(statement.kpis.approvedPaymentsGbp).toBe(0);
    expect(statement.kpis.refundsToDriverGbp).toBe(342.86);
    expect(statement.kpis.currentBalanceGbp).toBe(0);
    expect(statement.rows.at(-1)?.runningBalanceGbp).toBe(0);
  });
});
