import { describe, expect, it } from "vitest";
import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import {
  activeBalanceChargedPaidHint,
  activeBalanceDepositCardDisplay,
  activeBalanceHeroBreakdown,
  activeBalanceOpenAmountGbp,
  activeBalanceRentAccountRows,
  balanceRentScheduleAdjustmentLabel,
  balanceRentScheduleFutureSummary,
  splitBalanceRentScheduleRows,
  selectFeaturedOutstandingExtraCharge,
  activeBalanceStatementCalculation,
  defaultHirePaymentApplyTo,
} from "./hire-active-balance-display";

function rentRow(overrides: Partial<HirePaymentPageRow> & Pick<HirePaymentPageRow, "id" | "periodStart">): HirePaymentPageRow {
  return {
    rowKind: "rent",
    periodEnd: overrides.periodStart,
    periodLabel: overrides.periodStart,
    sortOrder: 0,
    baseAmountGbp: 10,
    discountTotalGbp: 0,
    netDueGbp: 10,
    paidGbp: 0,
    balanceGbp: 10,
    paymentStatus: "not_received",
    approvedAmountGbp: null,
    pendingSubmittedGbp: null,
    discounts: [],
    accrued: false,
    ...overrides,
  };
}

describe("hire active balance display", () => {
  it("builds hero breakdown from rent and extras only", () => {
    expect(activeBalanceHeroBreakdown(55, 90)).toBe("£55.00 rent + £90.00 extra charges");
    expect(activeBalanceHeroBreakdown(55, 0)).toBe("£55.00 rent");
    expect(activeBalanceHeroBreakdown(0, 0)).toBeNull();
  });

  it("formats charged and paid hints", () => {
    expect(activeBalanceChargedPaidHint(77, 22)).toBe("£77.00 charged · £22.00 paid");
  });

  it("shows paid deposit card when nothing outstanding", () => {
    expect(
      activeBalanceDepositCardDisplay({
        depositDueGbp: 100,
        depositPaidGbp: 100,
        depositOutstandingGbp: 0,
      }),
    ).toEqual({
      value: "Paid",
      hint: "£100.00 received · £0.00 outstanding",
      paid: true,
      warn: false,
    });
  });

  it("builds rent account rows", () => {
    expect(
      activeBalanceRentAccountRows({
        scheduledRentGbp: 80,
        discountGbp: 3,
        rentPaidGbp: 22,
        rentOutstandingGbp: 55,
      }),
    ).toEqual([
      { label: "Scheduled rent to date", value: "£80.00" },
      { label: "Discount applied", value: "−£3.00" },
      { label: "Rent paid", value: "−£22.00" },
      { label: "Outstanding rent", value: "£55.00", strong: true },
    ]);
  });

  it("selects the newest outstanding featured charge", () => {
    const selected = selectFeaturedOutstandingExtraCharge([
      { id: "a", balanceGbp: 10, createdAt: "2026-08-01T10:00:00Z" },
      { id: "b", balanceGbp: 90, createdAt: "2026-08-17T15:22:00Z" },
    ]);
    expect(selected?.id).toBe("b");
  });

  it("sums open balance from rent and extras", () => {
    expect(activeBalanceOpenAmountGbp(55, 90)).toBe(145);
  });

  it("formats adjustment labels for rent schedule", () => {
    expect(balanceRentScheduleAdjustmentLabel(0)).toBe("—");
    expect(balanceRentScheduleAdjustmentLabel(3)).toBe("−£3.00");
  });

  it("splits primary and future rent schedule rows", () => {
    const split = splitBalanceRentScheduleRows(
      [
        rentRow({ id: "past", periodStart: "2026-08-10", accrued: true }),
        rentRow({ id: "near", periodStart: "2026-08-20", accrued: false }),
        rentRow({ id: "far", periodStart: "2026-09-01", accrued: false }),
      ],
      "2026-08-18",
    );

    expect(split.primaryRows.map((row) => row.id)).toEqual(["past", "near"]);
    expect(split.futureRows.map((row) => row.id)).toEqual(["far"]);
  });

  it("summarises future contract schedule rows", () => {
    expect(
      balanceRentScheduleFutureSummary(
        [{ rowKind: "rent" }, { rowKind: "rent" }],
        "daily",
      ),
    ).toBe("2 daily periods · future rent is not currently owed");
  });

  it("builds the account statement calculation card", () => {
    expect(
      activeBalanceStatementCalculation({
        rentChargedAfterDiscountGbp: 77,
        extraChargesGbp: 100,
        paymentsReceivedGbp: 32,
        currentBalanceGbp: 145,
      }),
    ).toEqual({
      rows: [
        { label: "Rent charged after discount", value: "£77.00" },
        { label: "Extra charges", value: "+£100.00" },
        { label: "Payments received", value: "−£32.00" },
        { label: "Current balance", value: "£145.00", strong: true },
      ],
      footnote: "Pending payments remain separate until a company user approves them.",
    });
  });

  it("defaults statement payments to extra charges only when rent is clear", () => {
    expect(
      defaultHirePaymentApplyTo({
        rentOutstandingGbp: 40,
        extraOutstandingGbp: 25,
        extraChargesSelectable: true,
      }),
    ).toBe("schedule");
    expect(
      defaultHirePaymentApplyTo({
        rentOutstandingGbp: 0,
        extraOutstandingGbp: 25,
        extraChargesSelectable: true,
      }),
    ).toBe("extra_charges");
    expect(
      defaultHirePaymentApplyTo({
        rentOutstandingGbp: 0,
        extraOutstandingGbp: 25,
        extraChargesSelectable: false,
      }),
    ).toBe("schedule");
    expect(
      defaultHirePaymentApplyTo({
        rentOutstandingGbp: 40,
        extraOutstandingGbp: 25,
        extraChargesSelectable: true,
        preferred: "extra_charges",
      }),
    ).toBe("extra_charges");
  });
});
