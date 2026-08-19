import { describe, expect, it } from "vitest";
import {
  buildActiveHireSettlementBreakdown,
  buildHireSettlementBreakdown,
  groupHireSettlementBreakdownLines,
  hireExtraChargeBreakdownLabel,
} from "./hire-settlement-breakdown";
import type { HireTerminationAccountsSummary } from "./hire-termination-summary";

describe("hireExtraChargeBreakdownLabel", () => {
  it("joins type and description when they differ", () => {
    expect(
      hireExtraChargeBreakdownLabel({
        chargeType: "administration",
        chargeTypeLabel: "Administration",
        description: "Admin fee",
      }),
    ).toBe("Administration · Admin fee");
  });

  it("uses the type label when there is no extra detail", () => {
    expect(
      hireExtraChargeBreakdownLabel({
        chargeType: "damage",
        chargeTypeLabel: "Damage",
        description: "  Damage  ",
      }),
    ).toBe("Damage");
  });
});

describe("buildActiveHireSettlementBreakdown", () => {
  it("lists rent, discount, extra charges and payments before the amount still owed", () => {
    const breakdown = buildActiveHireSettlementBreakdown({
      rentDueGbp: 80,
      rentDiscountGbp: 3,
      rentPaidGbp: 20,
      extraChargesGbp: 40,
      extraChargesPaidGbp: 15,
      openBalanceGbp: 82,
      openDirection: "driver_owes_company",
      pendingPaymentsGbp: 2,
    });

    expect(breakdown.lines).toEqual([
      { label: "Rent due to date", amountGbp: 80, section: "rent", direction: "driver_pays" },
      { label: "Discount applied", amountGbp: 3, section: "rent", direction: "company_pays" },
      { label: "Rent paid", amountGbp: 20, section: "rent", direction: "company_pays" },
      { label: "Extra charges", amountGbp: 40, section: "charges", direction: "driver_pays" },
      {
        id: "extra-charges-paid",
        label: "Extra charges paid",
        amountGbp: 15,
        section: "charges",
        direction: "company_pays",
      },
    ]);
    expect(breakdown.openBalanceGbp).toBe(82);
    expect(breakdown.pendingPaymentsGbp).toBe(2);
    expect(groupHireSettlementBreakdownLines(breakdown.lines).map((section) => section.id)).toEqual([
      "rent",
      "charges",
    ]);
  });

  it("lists each extra charge with what it is for", () => {
    const breakdown = buildActiveHireSettlementBreakdown({
      rentDueGbp: 10,
      rentDiscountGbp: 0,
      rentPaidGbp: 0,
      extraChargesGbp: 55,
      extraCharges: [
        {
          id: "c-admin",
          chargeType: "administration",
          chargeTypeLabel: "Administration",
          description: "Admin fee",
          amountGbp: 15,
          resolution: "add_to_balance",
        },
        {
          id: "c-damage",
          chargeType: "damage",
          chargeTypeLabel: "Damage",
          description: "Rear bumper · scratch · high",
          amountGbp: 40,
          resolution: "add_to_balance",
        },
        {
          id: "c-waived",
          chargeType: "other",
          chargeTypeLabel: "Other",
          description: "Waived cleaning",
          amountGbp: 20,
          resolution: "waived",
        },
      ],
      extraChargesPaidGbp: 0,
      openBalanceGbp: 65,
      openDirection: "driver_owes_company",
    });

    expect(breakdown.lines.filter((line) => line.section === "charges")).toEqual([
      {
        id: "charge:c-admin",
        label: "Administration · Admin fee",
        amountGbp: 15,
        section: "charges",
        direction: "driver_pays",
      },
      {
        id: "charge:c-damage",
        label: "Damage · Rear bumper · scratch · high",
        amountGbp: 40,
        section: "charges",
        direction: "driver_pays",
      },
    ]);
  });

  it("omits zero discount, rent paid and extra-charge lines", () => {
    const breakdown = buildActiveHireSettlementBreakdown({
      rentDueGbp: 10,
      rentDiscountGbp: 0,
      rentPaidGbp: 0,
      extraChargesGbp: 0,
      extraChargesPaidGbp: 0,
      openBalanceGbp: 10,
      openDirection: "driver_owes_company",
    });
    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0]?.label).toBe("Rent due to date");
    expect(breakdown.pendingPaymentsGbp).toBe(0);
  });
});

describe("buildHireSettlementBreakdown", () => {
  it("itemizes extra charges instead of a lumped driver-charges line", () => {
    const terminationSummary = {
      accruedRentDueGbp: 100,
      accruedRentPaidGbp: 100,
      depositGbp: 0,
      netSettlementGbp: 0,
    } as HireTerminationAccountsSummary;

    const breakdown = buildHireSettlementBreakdown({
      terminationSummary,
      openBalanceGbp: 25,
      openDirection: "driver_owes_company",
      driverChargesGbp: 25,
      extraCharges: [
        {
          id: "c1",
          chargeType: "administration",
          chargeTypeLabel: "Administration",
          description: "Key replacement",
          amountGbp: 25,
          resolution: "add_to_balance",
        },
      ],
    });

    expect(breakdown?.lines.some((line) => line.label === "Driver charges (e.g. damage)")).toBe(false);
    expect(breakdown?.lines).toContainEqual({
      id: "charge:c1",
      label: "Administration · Key replacement",
      amountGbp: 25,
      section: "charges",
      direction: "driver_pays",
    });
  });
});
