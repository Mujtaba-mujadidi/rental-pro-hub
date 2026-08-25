/**
 * Golden hire-finance cases from docs/testing/hire-finance-manual-test-cases.xlsx.
 *
 * These assert the same projection the UI uses:
 * - Payments schedule / extras status + amounts (hire-finance + payment display)
 * - Vehicle P&L hire income components (schedule rent + cash driver charges + deposit retention)
 *
 * Ledger rows here are the backend-shaped inputs after mutations; the projector is the
 * frontend read model. Keep Excel case IDs in sync when expectations change.
 */
import { describe, expect, it } from "vitest";
import {
  computeHireExtraChargeLineMoney,
  computeHireIncomeGbp,
  computeHireSchedulePaymentRows,
} from "@/lib/fleet/hire-finance";
import type { HireDriverChargeLineItemRow } from "@/lib/fleet/hire-driver-charges";
import type { HireIncomeGroupContext } from "@/lib/fleet/hire-income";
import { deriveHirePaymentDisplayStatus } from "@/lib/fleet/hire-payment-display";
import type { HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";

const TODAY_YMD = "2026-08-23";
const HIRE_GROUP_ID = "g-ke18fsx";
const DEPOSIT_GBP = 1200;

type TimedPayment = { id: string; amountGbp: number; paidAt: string };

type HireFinanceLedger = {
  schedule: HirePaymentScheduleRowInput[];
  charges: HireDriverChargeLineItemRow[];
  timedPayments: TimedPayment[];
  contractEndedYmd: string | null;
  depositDisposition: string | null;
  depositRefundAmountGbp: number | null;
};

export type HireFinanceUiProjection = {
  schedule: Array<{
    id: string;
    rowKind: "rent" | "deposit";
    paymentStatus: string;
    displayStatus: string;
    paidGbp: number;
    balanceGbp: number;
  }>;
  extras: {
    postedGbp: number;
    paidGbp: number;
    outstandingGbp: number;
    lines: Array<{
      id: string;
      collectionStatus: string;
      dueGbp: number;
      paidGbp: number;
      balanceGbp: number;
    }>;
  };
  vehiclePnl: {
    rentIncomeGbp: number;
    driverChargeIncomeGbp: number;
    depositRetentionGbp: number;
    netHireIncomeGbp: number;
  };
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function rentRow(
  id: string,
  ymd: string,
  overrides: Partial<HirePaymentScheduleRowInput> = {},
): HirePaymentScheduleRowInput {
  return {
    id,
    periodStart: ymd,
    periodEnd: ymd,
    rowKind: "rent",
    baseAmountGbp: 20,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: Number(ymd.replaceAll("-", "")),
    ...overrides,
  };
}

function depositRow(overrides: Partial<HirePaymentScheduleRowInput> = {}): HirePaymentScheduleRowInput {
  return {
    id: "deposit",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-01",
    rowKind: "deposit",
    baseAmountGbp: DEPOSIT_GBP,
    discountTotalGbp: 0,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    sortOrder: -1,
    ...overrides,
  };
}

function charge(
  overrides: Partial<HireDriverChargeLineItemRow> &
    Pick<HireDriverChargeLineItemRow, "id" | "amountGbp" | "resolution">,
): HireDriverChargeLineItemRow {
  return {
    hireGroupId: HIRE_GROUP_ID,
    chargeType: "administration",
    sourceKind: "staff_manual",
    chargedOn: "2026-08-23",
    createdAt: "2026-08-23T12:00:00.000Z",
    ...overrides,
  };
}

function freshLedger(): HireFinanceLedger {
  return {
    schedule: [
      depositRow(),
      rentRow("rent-0801", "2026-08-01"),
      rentRow("rent-0802", "2026-08-02"),
      rentRow("rent-0803", "2026-08-03"),
    ],
    charges: [],
    timedPayments: [],
    contractEndedYmd: null,
    depositDisposition: null,
    depositRefundAmountGbp: null,
  };
}

function groupContext(ledger: HireFinanceLedger): Map<string, HireIncomeGroupContext> {
  return new Map([
    [
      HIRE_GROUP_ID,
      {
        contractEndedYmd: ledger.contractEndedYmd,
        rentCadence: "daily",
        rentBillingMode: "actual",
        settlementWriteOffGbp: 0,
        depositDisposition: ledger.depositDisposition,
        depositRefundAmountGbp: ledger.depositRefundAmountGbp,
        depositGbp: DEPOSIT_GBP,
        signedRentBalanceGbp: null,
      },
    ],
  ]);
}

/** Backend ledger → Payments UI + Vehicle Financials hire income (same maths the screens use). */
export function projectHireFinanceUi(ledger: HireFinanceLedger): HireFinanceUiProjection {
  const scheduleRows = computeHireSchedulePaymentRows(ledger.schedule, TODAY_YMD);
  const schedule = scheduleRows.map((row) => ({
    id: row.id,
    rowKind: row.rowKind,
    paymentStatus: row.paymentStatus,
    displayStatus: deriveHirePaymentDisplayStatus(
      {
        id: row.id,
        paymentStatus: row.paymentStatus,
        balanceGbp: row.balanceGbp,
        paidGbp: row.paidGbp,
        netDueGbp: row.netDueGbp,
        accrued: row.accrued,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        pendingSubmittedGbp: row.pendingSubmittedGbp,
      },
      TODAY_YMD,
    ),
    paidGbp: row.paidGbp,
    balanceGbp: row.balanceGbp,
  }));

  const extrasMoney = computeHireExtraChargeLineMoney({
    charges: ledger.charges,
    timedPayments: ledger.timedPayments,
  });

  // Schedule rent + deposit retention only (no driver-charge receipts) so rent P&L
  // matches Payments schedule approvals and deposit disposition — not pooled extras cash.
  const scheduleIncome = computeHireIncomeGbp({
    scheduleRows: ledger.schedule.map((row) => ({
      hireGroupId: HIRE_GROUP_ID,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      rowKind: row.rowKind,
      paymentStatus: row.paymentStatus,
      approvedAmountGbp: row.approvedAmountGbp,
      baseAmountGbp: row.baseAmountGbp,
      discountTotalGbp: row.discountTotalGbp,
    })),
    balancePayments: [],
    driverChargeLineItems: [],
    groupContextByGroupId: groupContext(ledger),
    todayYmd: TODAY_YMD,
  });

  // Driver-charge P&L must match Payments extras "paid" (timed FIFO), not pooled receipts.
  // That keeps overpayments from realising against charges posted later.
  const driverChargeIncomeGbp = extrasMoney.paidGbp;
  const depositRetentionGbp = scheduleIncome.depositRetentionGbp;
  const rentIncomeGbp = roundGbp(
    scheduleIncome.netIncomeGbp - depositRetentionGbp - scheduleIncome.supplementalCollectionsGbp,
  );
  const netHireIncomeGbp = roundGbp(rentIncomeGbp + driverChargeIncomeGbp + depositRetentionGbp);

  return {
    schedule,
    extras: {
      postedGbp: extrasMoney.postedGbp,
      paidGbp: extrasMoney.paidGbp,
      outstandingGbp: extrasMoney.outstandingGbp,
      lines: extrasMoney.lines.map((line) => ({
        id: line.chargeLineItemId,
        collectionStatus: line.collectionStatus,
        dueGbp: line.dueGbp,
        paidGbp: line.paidGbp,
        balanceGbp: line.balanceGbp,
      })),
    },
    vehiclePnl: {
      rentIncomeGbp,
      driverChargeIncomeGbp,
      depositRetentionGbp,
      netHireIncomeGbp,
    },
  };
}

function expectPnl(
  ui: HireFinanceUiProjection,
  expected: {
    rentIncomeGbp: number;
    driverChargeIncomeGbp: number;
    depositRetentionGbp?: number;
    netHireIncomeGbp: number;
    extrasOutstandingGbp?: number;
  },
) {
  expect(ui.vehiclePnl.rentIncomeGbp).toBe(expected.rentIncomeGbp);
  expect(ui.vehiclePnl.driverChargeIncomeGbp).toBe(expected.driverChargeIncomeGbp);
  expect(ui.vehiclePnl.depositRetentionGbp).toBe(expected.depositRetentionGbp ?? 0);
  expect(ui.vehiclePnl.netHireIncomeGbp).toBe(expected.netHireIncomeGbp);
  if (expected.extrasOutstandingGbp != null) {
    expect(ui.extras.outstandingGbp).toBe(expected.extrasOutstandingGbp);
  }
  // Payments extras paid must equal vehicle driver-charge income (single cash rule).
  expect(ui.vehiclePnl.driverChargeIncomeGbp).toBe(ui.extras.paidGbp);
}

describe("hire finance golden cases (Excel → Vitest)", () => {
  describe("01_Sequential_Cases (KE18FSX shape)", () => {
    const ledger = freshLedger();

    it("A01 — baseline wipe: zero P&L, unpaid schedule, no extras", () => {
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "deposit")).toMatchObject({
        paymentStatus: "not_received",
        paidGbp: 0,
      });
      expect(ui.schedule.filter((r) => r.rowKind === "rent").every((r) => r.paidGbp === 0)).toBe(true);
      expect(ui.extras.outstandingGbp).toBe(0);
      expectPnl(ui, {
        rentIncomeGbp: 0,
        driverChargeIncomeGbp: 0,
        netHireIncomeGbp: 0,
        extrasOutstandingGbp: 0,
      });
    });

    it("B01 — pending rent is not income", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.paymentStatus = "pending_approval";
      row.pendingSubmittedGbp = 20;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "rent-0801")?.displayStatus).toBe("pending_approval");
      expectPnl(ui, { rentIncomeGbp: 0, driverChargeIncomeGbp: 0, netHireIncomeGbp: 0 });
    });

    it("B02 — rejected rent is not income", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.paymentStatus = "rejected";
      row.pendingSubmittedGbp = null;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "rent-0801")?.displayStatus).toBe("rejected");
      expectPnl(ui, { rentIncomeGbp: 0, driverChargeIncomeGbp: 0, netHireIncomeGbp: 0 });
    });

    it("B03 — approve rent £20 → rent income £20", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.paymentStatus = "approved";
      row.approvedAmountGbp = 20;
      row.pendingSubmittedGbp = null;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "rent-0801")).toMatchObject({
        displayStatus: "paid",
        paidGbp: 20,
        balanceGbp: 0,
      });
      expectPnl(ui, { rentIncomeGbp: 20, driverChargeIncomeGbp: 0, netHireIncomeGbp: 20 });
    });

    it("B04 — second rent approved → rent income £40", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0802")!;
      row.paymentStatus = "approved";
      row.approvedAmountGbp = 20;
      const ui = projectHireFinanceUi(ledger);
      expectPnl(ui, { rentIncomeGbp: 40, driverChargeIncomeGbp: 0, netHireIncomeGbp: 40 });
    });

    it("B05 — amend rent down to £10 → rent income £30", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.approvedAmountGbp = 10;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "rent-0801")).toMatchObject({
        paidGbp: 10,
        balanceGbp: 10,
        displayStatus: "partially_paid",
      });
      expectPnl(ui, { rentIncomeGbp: 30, driverChargeIncomeGbp: 0, netHireIncomeGbp: 30 });
    });

    it("B06 — restore rent to £20 → rent income £40", () => {
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.approvedAmountGbp = 20;
      const ui = projectHireFinanceUi(ledger);
      expectPnl(ui, { rentIncomeGbp: 40, driverChargeIncomeGbp: 0, netHireIncomeGbp: 40 });
    });

    it("C01 — partial deposit held is not income", () => {
      const row = ledger.schedule.find((r) => r.id === "deposit")!;
      row.paymentStatus = "approved";
      row.approvedAmountGbp = 600;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "deposit")).toMatchObject({
        paidGbp: 600,
        balanceGbp: 600,
      });
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 0,
        depositRetentionGbp: 0,
        netHireIncomeGbp: 40,
      });
    });

    it("C02 — full deposit held is still not income", () => {
      const row = ledger.schedule.find((r) => r.id === "deposit")!;
      row.approvedAmountGbp = 1200;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.schedule.find((r) => r.id === "deposit")?.paidGbp).toBe(1200);
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 0,
        depositRetentionGbp: 0,
        netHireIncomeGbp: 40,
      });
    });

    it("D01 — unpaid add_to_balance extra is due, not P&L income", () => {
      ledger.charges.push(
        charge({
          id: "x-100",
          amountGbp: 100,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T10:00:00.000Z",
        }),
      );
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines[0]).toMatchObject({
        collectionStatus: "due",
        dueGbp: 100,
        paidGbp: 0,
        balanceGbp: 100,
      });
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 0,
        netHireIncomeGbp: 40,
        extrasOutstandingGbp: 100,
      });
    });

    it("D02 — second unpaid extra increases outstanding only", () => {
      ledger.charges.push(
        charge({
          id: "x-30",
          amountGbp: 30,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T11:00:00.000Z",
        }),
      );
      const ui = projectHireFinanceUi(ledger);
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 0,
        netHireIncomeGbp: 40,
        extrasOutstandingGbp: 130,
      });
    });

    it("D03 — FIFO partial £40 → oldest line partially_paid; income £40", () => {
      ledger.timedPayments.push({
        id: "p-40",
        amountGbp: 40,
        paidAt: "2026-08-23T12:00:00.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-100")).toMatchObject({
        collectionStatus: "partially_paid",
        paidGbp: 40,
        balanceGbp: 60,
      });
      expect(ui.extras.lines.find((l) => l.id === "x-30")?.collectionStatus).toBe("due");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 40,
        netHireIncomeGbp: 80,
        extrasOutstandingGbp: 90,
      });
    });

    it("D04 — pay £60 clears first charge; income £100", () => {
      ledger.timedPayments.push({
        id: "p-60",
        amountGbp: 60,
        paidAt: "2026-08-23T13:00:00.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-100")?.collectionStatus).toBe("paid");
      expect(ui.extras.lines.find((l) => l.id === "x-30")?.collectionStatus).toBe("due");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 100,
        netHireIncomeGbp: 140,
        extrasOutstandingGbp: 30,
      });
    });

    it("D05 — clear second charge; income £130", () => {
      ledger.timedPayments.push({
        id: "p-30",
        amountGbp: 30,
        paidAt: "2026-08-23T14:00:00.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.outstandingGbp).toBe(0);
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 130,
        netHireIncomeGbp: 170,
        extrasOutstandingGbp: 0,
      });
    });

    it("D06 — paid_now £50 increases driver-charge income immediately", () => {
      ledger.charges.push(
        charge({
          id: "x-paid-now-50",
          amountGbp: 50,
          resolution: "paid_now",
          createdAt: "2026-08-23T15:00:00.000Z",
        }),
      );
      // Linked receipt for paid_now (same amount). Income still £50 from paid_now, not double-counted.
      ledger.timedPayments.push({
        id: "p-paid-now-50",
        amountGbp: 50,
        paidAt: "2026-08-23T15:00:01.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-paid-now-50")?.collectionStatus).toBe("paid");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 180,
        netHireIncomeGbp: 220,
        extrasOutstandingGbp: 0,
      });
    });

    it("D07 — unpaid extra after paid_now does not increase income", () => {
      ledger.charges.push(
        charge({
          id: "x-25",
          amountGbp: 25,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T16:00:00.000Z",
        }),
      );
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-25")?.collectionStatus).toBe("due");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 180,
        netHireIncomeGbp: 220,
        extrasOutstandingGbp: 25,
      });
    });

    it("D08 — void unpaid extra clears outstanding without changing income", () => {
      const row = ledger.charges.find((c) => c.id === "x-25")!;
      row.resolution = "voided";
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-25")?.collectionStatus).toBe("voided");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 180,
        netHireIncomeGbp: 220,
        extrasOutstandingGbp: 0,
      });
    });

    it("D09 — waived charge is never income", () => {
      ledger.charges.push(
        charge({
          id: "x-waived-40",
          amountGbp: 40,
          resolution: "waived",
          createdAt: "2026-08-23T17:00:00.000Z",
        }),
      );
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-waived-40")?.collectionStatus).toBe("waived");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 180,
        netHireIncomeGbp: 220,
        extrasOutstandingGbp: 0,
      });
    });

    it("D10 — over-receipt capped at billed extras (+£20)", () => {
      ledger.charges.push(
        charge({
          id: "x-20",
          amountGbp: 20,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T18:00:00.000Z",
        }),
      );
      ledger.timedPayments.push({
        id: "p-over-50",
        amountGbp: 50,
        paidAt: "2026-08-23T18:30:00.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-20")).toMatchObject({
        collectionStatus: "paid",
        paidGbp: 20,
        balanceGbp: 0,
      });
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 200,
        netHireIncomeGbp: 240,
        extrasOutstandingGbp: 0,
      });
    });

    it("E01 — rejected extras payment does not realise income (pending is not in timedPayments)", () => {
      // Pending/rejected submissions never enter timedPayments (approved receipts only).
      ledger.charges.push(
        charge({
          id: "x-80",
          amountGbp: 80,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T19:00:00.000Z",
        }),
      );
      const before = projectHireFinanceUi(ledger);
      expect(before.extras.lines.find((l) => l.id === "x-80")?.collectionStatus).toBe("due");
      expect(before.vehiclePnl.driverChargeIncomeGbp).toBe(200);
      // Rejected → still no timed payment added.
      const afterReject = projectHireFinanceUi(ledger);
      expect(afterReject.vehiclePnl.driverChargeIncomeGbp).toBe(200);
      expect(afterReject.extras.outstandingGbp).toBe(80);
    });

    it("E02 — approve extras £80 after reject → income +£80", () => {
      ledger.timedPayments.push({
        id: "p-80",
        amountGbp: 80,
        paidAt: "2026-08-23T20:00:00.000Z",
      });
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "x-80")?.collectionStatus).toBe("paid");
      expectPnl(ui, {
        rentIncomeGbp: 40,
        driverChargeIncomeGbp: 280,
        netHireIncomeGbp: 320,
        extrasOutstandingGbp: 0,
      });
    });

    it("G01 — unpaid extras on ending hire still excluded from driver-charge income", () => {
      ledger.charges.push(
        charge({
          id: "x-end-100",
          amountGbp: 100,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T21:00:00.000Z",
        }),
      );
      ledger.contractEndedYmd = "2026-08-23";
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.outstandingGbp).toBe(100);
      expect(ui.vehiclePnl.driverChargeIncomeGbp).toBe(280);
      expect(ui.extras.paidGbp).toBe(280);
      // Ending the hire must not turn unpaid extras into vehicle income.
      expect(ui.vehiclePnl.netHireIncomeGbp).toBe(
        roundGbp(ui.vehiclePnl.rentIncomeGbp + 280 + ui.vehiclePnl.depositRetentionGbp),
      );
    });

    it("G03 — deposit forfeit becomes retention income (not rent)", () => {
      ledger.depositDisposition = "forfeit";
      const ui = projectHireFinanceUi(ledger);
      expect(ui.vehiclePnl.depositRetentionGbp).toBe(1200);
      expect(ui.vehiclePnl.driverChargeIncomeGbp).toBe(280);
      expect(ui.vehiclePnl.netHireIncomeGbp).toBe(
        roundGbp(ui.vehiclePnl.rentIncomeGbp + 280 + 1200),
      );
    });

    it("G04 — full deposit refund → retention £0", () => {
      ledger.depositDisposition = "refund_full";
      ledger.depositRefundAmountGbp = 1200;
      const ui = projectHireFinanceUi(ledger);
      expect(ui.vehiclePnl.depositRetentionGbp).toBe(0);
    });
  });

  describe("02_Edge_Cases", () => {
    it("X01 — FIFO: oldest unpaid charge is paid first", () => {
      const ledger = freshLedger();
      ledger.charges = [
        charge({ id: "A", amountGbp: 10, resolution: "add_to_balance", createdAt: "2026-08-23T10:00:00.000Z" }),
        charge({ id: "B", amountGbp: 10, resolution: "add_to_balance", createdAt: "2026-08-23T11:00:00.000Z" }),
      ];
      ledger.timedPayments = [{ id: "p1", amountGbp: 10, paidAt: "2026-08-23T12:00:00.000Z" }];
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "A")?.collectionStatus).toBe("paid");
      expect(ui.extras.lines.find((l) => l.id === "B")?.collectionStatus).toBe("due");
      expectPnl(ui, {
        rentIncomeGbp: 0,
        driverChargeIncomeGbp: 10,
        netHireIncomeGbp: 10,
        extrasOutstandingGbp: 10,
      });
    });

    it("X02 — paid_now cash must not settle a later add_to_balance charge", () => {
      const ledger = freshLedger();
      ledger.charges = [
        charge({
          id: "now",
          amountGbp: 40,
          resolution: "paid_now",
          createdAt: "2026-08-23T10:00:00.000Z",
          balancePaymentId: "p-now",
        }),
        charge({
          id: "later",
          amountGbp: 50,
          resolution: "add_to_balance",
          createdAt: "2026-08-23T11:00:00.000Z",
        }),
      ];
      ledger.timedPayments = [{ id: "p-now", amountGbp: 40, paidAt: "2026-08-23T10:00:01.000Z" }];
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "now")?.collectionStatus).toBe("paid");
      expect(ui.extras.lines.find((l) => l.id === "later")).toMatchObject({
        collectionStatus: "due",
        paidGbp: 0,
        balanceGbp: 50,
      });
      expectPnl(ui, {
        rentIncomeGbp: 0,
        driverChargeIncomeGbp: 40,
        netHireIncomeGbp: 40,
        extrasOutstandingGbp: 50,
      });
    });

    it("X02b — amending charged-now paid amount reduces extras paid and vehicle income", () => {
      const ledger = freshLedger();
      ledger.charges = [
        charge({
          id: "pcn",
          amountGbp: 30,
          resolution: "add_to_balance",
          createdAt: "2026-08-24T01:56:00.000Z",
        }),
        charge({
          id: "later",
          amountGbp: 50,
          resolution: "add_to_balance",
          createdAt: "2026-08-24T12:00:00.000Z",
        }),
      ];
      ledger.timedPayments = [{ id: "pay-now", amountGbp: 10, paidAt: "2026-08-24T01:56:00.000Z" }];
      const ui = projectHireFinanceUi(ledger);
      expect(ui.extras.lines.find((l) => l.id === "pcn")).toMatchObject({
        collectionStatus: "partially_paid",
        paidGbp: 10,
        balanceGbp: 20,
      });
      expect(ui.extras.lines.find((l) => l.id === "later")).toMatchObject({
        collectionStatus: "due",
        paidGbp: 0,
      });
      expectPnl(ui, {
        rentIncomeGbp: 0,
        driverChargeIncomeGbp: 10,
        netHireIncomeGbp: 10,
        extrasOutstandingGbp: 70,
      });
    });

    it("X03 — amend approved rent to £0 removes rent income", () => {
      const ledger = freshLedger();
      const row = ledger.schedule.find((r) => r.id === "rent-0801")!;
      row.paymentStatus = "approved";
      row.approvedAmountGbp = 20;
      expect(projectHireFinanceUi(ledger).vehiclePnl.rentIncomeGbp).toBe(20);
      row.paymentStatus = "not_received";
      row.approvedAmountGbp = null;
      expectPnl(projectHireFinanceUi(ledger), {
        rentIncomeGbp: 0,
        driverChargeIncomeGbp: 0,
        netHireIncomeGbp: 0,
      });
    });

    it("X04 — three rapid rent approvals realise £60 once", () => {
      const ledger = freshLedger();
      for (const id of ["rent-0801", "rent-0802", "rent-0803"]) {
        const row = ledger.schedule.find((r) => r.id === id)!;
        row.paymentStatus = "approved";
        row.approvedAmountGbp = 20;
      }
      expectPnl(projectHireFinanceUi(ledger), {
        rentIncomeGbp: 60,
        driverChargeIncomeGbp: 0,
        netHireIncomeGbp: 60,
      });
    });
  });

  describe("03_Running_Totals milestones (B07 skipped)", () => {
    it("matches Excel cumulative P&L checkpoints through D10", () => {
      const ledger = freshLedger();
      const milestones: Array<{
        label: string;
        apply: () => void;
        rent: number;
        charges: number;
        net: number;
        extrasOut: number;
      }> = [
        {
          label: "A01",
          apply: () => undefined,
          rent: 0,
          charges: 0,
          net: 0,
          extrasOut: 0,
        },
        {
          label: "B03",
          apply: () => {
            const r = ledger.schedule.find((x) => x.id === "rent-0801")!;
            r.paymentStatus = "approved";
            r.approvedAmountGbp = 20;
          },
          rent: 20,
          charges: 0,
          net: 20,
          extrasOut: 0,
        },
        {
          label: "B04",
          apply: () => {
            const r = ledger.schedule.find((x) => x.id === "rent-0802")!;
            r.paymentStatus = "approved";
            r.approvedAmountGbp = 20;
          },
          rent: 40,
          charges: 0,
          net: 40,
          extrasOut: 0,
        },
        {
          label: "B05",
          apply: () => {
            ledger.schedule.find((x) => x.id === "rent-0801")!.approvedAmountGbp = 10;
          },
          rent: 30,
          charges: 0,
          net: 30,
          extrasOut: 0,
        },
        {
          label: "B06",
          apply: () => {
            ledger.schedule.find((x) => x.id === "rent-0801")!.approvedAmountGbp = 20;
          },
          rent: 40,
          charges: 0,
          net: 40,
          extrasOut: 0,
        },
        {
          label: "C02",
          apply: () => {
            const d = ledger.schedule.find((x) => x.id === "deposit")!;
            d.paymentStatus = "approved";
            d.approvedAmountGbp = 1200;
          },
          rent: 40,
          charges: 0,
          net: 40,
          extrasOut: 0,
        },
        {
          label: "D01",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-100", amountGbp: 100, resolution: "add_to_balance", createdAt: "2026-08-23T10:00:00.000Z" }),
            );
          },
          rent: 40,
          charges: 0,
          net: 40,
          extrasOut: 100,
        },
        {
          label: "D02",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-30", amountGbp: 30, resolution: "add_to_balance", createdAt: "2026-08-23T11:00:00.000Z" }),
            );
          },
          rent: 40,
          charges: 0,
          net: 40,
          extrasOut: 130,
        },
        {
          label: "D03",
          apply: () => {
            ledger.timedPayments.push({ id: "m-p40", amountGbp: 40, paidAt: "2026-08-23T12:00:00.000Z" });
          },
          rent: 40,
          charges: 40,
          net: 80,
          extrasOut: 90,
        },
        {
          label: "D04",
          apply: () => {
            ledger.timedPayments.push({ id: "m-p60", amountGbp: 60, paidAt: "2026-08-23T13:00:00.000Z" });
          },
          rent: 40,
          charges: 100,
          net: 140,
          extrasOut: 30,
        },
        {
          label: "D05",
          apply: () => {
            ledger.timedPayments.push({ id: "m-p30", amountGbp: 30, paidAt: "2026-08-23T14:00:00.000Z" });
          },
          rent: 40,
          charges: 130,
          net: 170,
          extrasOut: 0,
        },
        {
          label: "D06",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-now", amountGbp: 50, resolution: "paid_now", createdAt: "2026-08-23T15:00:00.000Z" }),
            );
            ledger.timedPayments.push({ id: "m-p50", amountGbp: 50, paidAt: "2026-08-23T15:00:01.000Z" });
          },
          rent: 40,
          charges: 180,
          net: 220,
          extrasOut: 0,
        },
        {
          label: "D07",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-25", amountGbp: 25, resolution: "add_to_balance", createdAt: "2026-08-23T16:00:00.000Z" }),
            );
          },
          rent: 40,
          charges: 180,
          net: 220,
          extrasOut: 25,
        },
        {
          label: "D08",
          apply: () => {
            ledger.charges.find((c) => c.id === "m-25")!.resolution = "voided";
          },
          rent: 40,
          charges: 180,
          net: 220,
          extrasOut: 0,
        },
        {
          label: "D09",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-waive", amountGbp: 40, resolution: "waived", createdAt: "2026-08-23T17:00:00.000Z" }),
            );
          },
          rent: 40,
          charges: 180,
          net: 220,
          extrasOut: 0,
        },
        {
          label: "D10",
          apply: () => {
            ledger.charges.push(
              charge({ id: "m-20", amountGbp: 20, resolution: "add_to_balance", createdAt: "2026-08-23T18:00:00.000Z" }),
            );
            ledger.timedPayments.push({ id: "m-p50b", amountGbp: 50, paidAt: "2026-08-23T18:30:00.000Z" });
          },
          rent: 40,
          charges: 200,
          net: 240,
          extrasOut: 0,
        },
      ];

      for (const milestone of milestones) {
        milestone.apply();
        const ui = projectHireFinanceUi(ledger);
        expect({ label: milestone.label, ...ui.vehiclePnl, extras: ui.extras.outstandingGbp }).toEqual({
          label: milestone.label,
          rentIncomeGbp: milestone.rent,
          driverChargeIncomeGbp: milestone.charges,
          depositRetentionGbp: 0,
          netHireIncomeGbp: milestone.net,
          extras: milestone.extrasOut,
        });
      }
    });
  });
});
