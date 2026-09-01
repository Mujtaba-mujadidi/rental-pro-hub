import { describe, expect, it } from "vitest";
import {
  buildHireEndHireFinalAccountModel,
  buildReturnChargeOverviewLines,
  sumReturnChargeOverviewGbp,
} from "@/lib/fleet/hire-end-hire-final-account";
import type { HireEndHireFinancialReview } from "@/lib/fleet/hire-end-hire-financial";
import type { HireReturnChargesPageData } from "@/app/actions/hire-return-charges";

function baseReview(overrides: Partial<HireEndHireFinancialReview> = {}): HireEndHireFinancialReview {
  return {
    rentChargedGbp: 615,
    rentChargedHint: "",
    rentReceivedGbp: 55,
    rentReceivedHint: "",
    depositRequiredGbp: 1200,
    depositReceivedGbp: 600,
    depositUnpaid: false,
    depositRequiredGbpLabel: "",
    extraChargesPostedGbp: 280,
    extraChargesReceivedGbp: 230,
    extraChargesOutstandingGbp: 50,
    extraChargesHint: "",
    pendingRentGbp: 0,
    pendingExtraChargesGbp: 0,
    pendingDepositGbp: 0,
    pendingApprovalTotalGbp: 0,
    pendingApprovalItems: [],
    owedBeforeCheckinGbp: 610,
    positionDirection: "driver_owes_company",
    positionLabel: "Driver owes £610.00",
    categories: [],
    accountSections: [],
    lines: [],
    ...overrides,
  };
}

const returnCharges: HireReturnChargesPageData = {
  checkinCompleted: true,
  checkinInspectionId: "insp-1",
  checkoutFuelLevel: 80,
  checkinFuelLevel: 60,
  fuelShortfall: true,
  missingAccessories: [],
  newDamages: [
    {
      id: "d1",
      panelId: "rear_bonnet",
      panelLabel: "Rear bonnet scratch",
      damageType: "scratch",
      severity: "minor",
      notes: null,
      chargeGbp: 100,
      chargeResolution: "add_to_balance",
    },
    {
      id: "d2",
      panelId: "front_bonnet",
      panelLabel: "Front bonnet chip",
      damageType: "chip",
      severity: "moderate",
      notes: null,
      chargeGbp: 250,
      chargeResolution: "add_to_balance",
    },
  ],
  appliedFuelCharge: { amountGbp: 50, resolution: "add_to_balance" },
  fuelReviewLater: false,
  appliedAccessoryCharges: [],
  accessoryReviewsLater: [],
  returnChargesDraftSavedAt: "2026-08-31T21:00:00.000Z",
  returnChargesAppliedAt: null,
  returnChargesReady: true,
};

describe("buildReturnChargeOverviewLines", () => {
  it("includes damage and fuel return charges from the saved draft", () => {
    const lines = buildReturnChargeOverviewLines(returnCharges);
    expect(lines).toHaveLength(3);
    expect(sumReturnChargeOverviewGbp(lines)).toBe(400);
    expect(lines.map((line) => line.label)).toEqual([
      "Rear bonnet scratch",
      "Front bonnet chip",
      "Fuel shortfall",
    ]);
  });

  it("falls back to the end-hire return charges draft when page data is not merged yet", () => {
    const unmergedReturnCharges: HireReturnChargesPageData = {
      ...returnCharges,
      newDamages: returnCharges.newDamages.map((damage) => ({
        ...damage,
        chargeGbp: null,
        chargeResolution: null,
      })),
      appliedFuelCharge: null,
    };
    const draft = {
      damages: returnCharges.newDamages.map((damage) => ({
        id: damage.id,
        checkoutDamageId: null,
        chargeGbp: damage.chargeGbp,
        chargeResolution: damage.chargeResolution,
      })),
      fuel: {
        enabled: true,
        amountGbp: 50,
        chargeResolution: "add_to_balance",
      },
      accessories: [],
    };

    const lines = buildReturnChargeOverviewLines(unmergedReturnCharges, draft);
    expect(sumReturnChargeOverviewGbp(lines)).toBe(400);
  });
});

describe("buildHireEndHireFinalAccountModel", () => {
  it("rolls return charges into final totals and balance", () => {
    const model = buildHireEndHireFinalAccountModel({
      review: baseReview(),
      rentCutoffLabel: "31 Aug 2026, 22:09",
      returnCharges,
      returnChargesDraft: {
        damages: returnCharges.newDamages.map((damage) => ({
          id: damage.id,
          checkoutDamageId: null,
          chargeGbp: damage.chargeGbp,
          chargeResolution: damage.chargeResolution,
        })),
        fuel: {
          enabled: true,
          amountGbp: 50,
          chargeResolution: "add_to_balance",
        },
        accessories: [],
      },
      depositHeldGbp: 600,
      depositRequiredGbp: 1200,
      depositNeedsDecision: true,
      currentSignedSettlementGbp: 610,
      returnChargesApplied: false,
    });

    expect(model.totalFinalChargesGbp).toBe(1295);
    expect(model.driverPaymentsReceivedGbp).toBe(285);
    expect(model.currentDriverBalanceGbp).toBe(1010);
    expect(model.chargeLines).toHaveLength(5);
  });
});
