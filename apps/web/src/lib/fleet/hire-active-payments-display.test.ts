import { describe, expect, it } from "vitest";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  buildFullPaymentScheduleSummary,
  formatNextPaymentHeading,
  payBalanceToDateGbp,
  rentPaidStatHint,
  selectUpcomingPaymentRows,
  upcomingPaymentStatusLabel,
} from "@/lib/fleet/hire-active-payments-display";

function row(partial: Partial<HirePaymentPageRow> & Pick<HirePaymentPageRow, "id" | "periodStart">): HirePaymentPageRow {
  return {
    id: partial.id,
    rowKind: partial.rowKind ?? "rent",
    periodStart: partial.periodStart,
    periodEnd: partial.periodEnd ?? partial.periodStart,
    periodLabel: partial.periodLabel ?? partial.periodStart,
    sortOrder: partial.sortOrder ?? 0,
    baseAmountGbp: partial.baseAmountGbp ?? 10,
    discountTotalGbp: partial.discountTotalGbp ?? 0,
    netDueGbp: partial.netDueGbp ?? 10,
    paidGbp: partial.paidGbp ?? 0,
    balanceGbp: partial.balanceGbp ?? 10,
    paymentStatus: partial.paymentStatus ?? "not_received",
    accrued: partial.accrued ?? true,
    pendingSubmittedGbp: partial.pendingSubmittedGbp ?? null,
    approvedAmountGbp: partial.approvedAmountGbp ?? null,
    discounts: partial.discounts ?? [],
  };
}

describe("selectUpcomingPaymentRows", () => {
  it("returns unpaid deposit and accrued rent rows in order", () => {
    const rows = selectUpcomingPaymentRows(
      [
        row({ id: "deposit", rowKind: "deposit", periodStart: "2026-08-10", balanceGbp: 100, netDueGbp: 100 }),
        row({ id: "today", periodStart: "2026-08-10", balanceGbp: 10, netDueGbp: 10, accrued: true }),
        row({
          id: "future",
          periodStart: "2026-08-11",
          balanceGbp: 10,
          netDueGbp: 10,
          accrued: false,
        }),
        row({
          id: "paid",
          periodStart: "2026-08-09",
          balanceGbp: 0,
          paidGbp: 10,
          netDueGbp: 10,
          paymentStatus: "approved",
        }),
      ],
      "2026-08-10",
    );

    expect(rows.map((item) => item.id)).toEqual(["deposit", "today", "future"]);
  });
});

describe("upcomingPaymentStatusLabel", () => {
  it("labels accrued today rows as Due today", () => {
    const label = upcomingPaymentStatusLabel(
      row({ id: "today", periodStart: "2026-08-10", balanceGbp: 10, accrued: true }),
      "2026-08-10",
    );
    expect(label.label).toBe("Due today");
  });
});

describe("formatNextPaymentHeading", () => {
  it("uses Tomorrow prefix for the next day", () => {
    expect(formatNextPaymentHeading("2026-08-11", "2026-08-10")).toBe("Tomorrow - 11/08/2026");
  });
});

describe("buildFullPaymentScheduleSummary", () => {
  it("summarises rent periods and contract total", () => {
    expect(
      buildFullPaymentScheduleSummary(
        [{ rowKind: "deposit" }, { rowKind: "rent" }, { rowKind: "rent" }],
        3650,
      ),
    ).toBe("2 rent periods = £3,650.00 before any future changes");
  });
});

describe("rentPaidStatHint", () => {
  it("shows outstanding rent when balance remains", () => {
    expect(rentPaidStatHint(0, 10)).toBe("Outstanding rent: £10.00");
  });
});

describe("payBalanceToDateGbp", () => {
  it("adds unpaid deposit to accrued rent balance", () => {
    expect(
      payBalanceToDateGbp([
        {
          rowKind: "deposit",
          balanceGbp: 100,
          paymentStatus: "not_received",
          accrued: true,
        },
        {
          rowKind: "rent",
          balanceGbp: 10,
          paymentStatus: "not_received",
          accrued: true,
        },
      ]),
    ).toBe(110);
  });

  it("ignores deposit awaiting approval", () => {
    expect(
      payBalanceToDateGbp([
        {
          rowKind: "deposit",
          balanceGbp: 100,
          paymentStatus: "pending_approval",
          accrued: true,
        },
        {
          rowKind: "rent",
          balanceGbp: 10,
          paymentStatus: "not_received",
          accrued: true,
        },
      ]),
    ).toBe(10);
  });

  it("ignores rent awaiting approval", () => {
    expect(
      payBalanceToDateGbp([
        {
          rowKind: "deposit",
          balanceGbp: 100,
          paymentStatus: "not_received",
          accrued: true,
        },
        {
          rowKind: "rent",
          balanceGbp: 10,
          paymentStatus: "pending_approval",
          accrued: true,
        },
      ]),
    ).toBe(100);
  });

  it("ignores future rent periods", () => {
    expect(
      payBalanceToDateGbp([
        {
          rowKind: "rent",
          balanceGbp: 10,
          paymentStatus: "not_received",
          accrued: true,
        },
        {
          rowKind: "rent",
          balanceGbp: 10,
          paymentStatus: "not_received",
          accrued: false,
        },
      ]),
    ).toBe(10);
  });
});
