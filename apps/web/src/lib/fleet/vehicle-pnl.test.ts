import { describe, expect, it } from "vitest";
import { computeVehiclePnl } from "@/lib/fleet/vehicle-pnl";

describe("computeVehiclePnl", () => {
  it("computes net P&L when sold with purchase and maintenance", () => {
    const r = computeVehiclePnl({
      purchaseGbp: 10000,
      saleGbp: 7500,
      maintenanceTotalGbp: 1200,
    });
    expect(r.capitalGainGbp).toBe(-2500);
    expect(r.operatingCostGbp).toBe(1200);
    expect(r.netPnlGbp).toBe(-3700);
    expect(r.isSold).toBe(true);
    expect(r.bookPositionGbp).toBeNull();
  });

  it("shows book position while owned", () => {
    const r = computeVehiclePnl({
      purchaseGbp: 8000,
      saleGbp: null,
      maintenanceTotalGbp: 500,
    });
    expect(r.netPnlGbp).toBeNull();
    expect(r.bookPositionGbp).toBe(8500);
    expect(r.isSold).toBe(false);
    expect(r.hasPurchase).toBe(true);
  });

  it("allows sale without recorded purchase", () => {
    const r = computeVehiclePnl({
      purchaseGbp: null,
      saleGbp: 5000,
      maintenanceTotalGbp: 0,
    });
    expect(r.capitalGainGbp).toBe(5000);
    expect(r.netPnlGbp).toBe(5000);
  });

  it("includes optional revenue and cost lines when provided", () => {
    const r = computeVehiclePnl({
      purchaseGbp: 10000,
      saleGbp: 12000,
      maintenanceTotalGbp: 800,
      rentalIncomeGbp: 3000,
      pcnTotalGbp: 200,
      claimsNetGbp: 100,
    });
    expect(r.operatingCostGbp).toBe(900);
    expect(r.netPnlGbp).toBe(4100);
  });

  it("treats negative maintenance as zero operating cost component", () => {
    const r = computeVehiclePnl({
      purchaseGbp: 1000,
      saleGbp: null,
      maintenanceTotalGbp: -50,
    });
    expect(r.maintenanceTotalGbp).toBe(0);
    expect(r.bookPositionGbp).toBe(1000);
  });
});
