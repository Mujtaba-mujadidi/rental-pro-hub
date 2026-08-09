import { describe, expect, it } from "vitest";
import {
  assertHireSettlementFinalizationAllowed,
  assertProvisionalTerminationDeposit,
  assertProvisionalTerminationSettlement,
  canFinalizeHireSettlement,
  provisionalTerminationSettlementResolution,
  PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION,
  PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION,
} from "@/lib/fleet/hire-settlement-finalization";

describe("hire-settlement-finalization", () => {
  it("blocks finalization until check-in is complete", () => {
    expect(assertHireSettlementFinalizationAllowed(false)).toMatch(/check-in/i);
    expect(assertHireSettlementFinalizationAllowed(true)).toBeNull();
    expect(assertHireSettlementFinalizationAllowed(false, "driver")).toMatch(/rental company/i);
  });

  it("requires hold_pending deposit at provisional termination when deposit was paid", () => {
    expect(assertProvisionalTerminationDeposit("hold_pending", 500)).toBeNull();
    expect(assertProvisionalTerminationDeposit("refund_full", 500)).toMatch(/Hold the deposit/i);
    expect(assertProvisionalTerminationDeposit("refund_full", 0)).toBeNull();
  });

  it("requires open_balance settlement at provisional termination", () => {
    expect(assertProvisionalTerminationSettlement("open_balance", 100)).toBeNull();
    expect(assertProvisionalTerminationSettlement("paid_now", 100)).toMatch(/after check-in/i);
    expect(assertProvisionalTerminationSettlement("written_off", 50)).toMatch(/after check-in/i);
    expect(assertProvisionalTerminationSettlement("paid_now", 0)).toBeNull();
  });

  it("resolves provisional settlement resolution", () => {
    expect(provisionalTerminationSettlementResolution(0)).toBeNull();
    expect(provisionalTerminationSettlementResolution(42.5)).toBe(
      PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION,
    );
  });

  it("detects when settlement can be finalized", () => {
    expect(
      canFinalizeHireSettlement({ contractEnded: true, checkinCompleted: true }),
    ).toBe(true);
    expect(
      canFinalizeHireSettlement({ contractEnded: true, checkinCompleted: false }),
    ).toBe(false);
    expect(
      canFinalizeHireSettlement({ contractEnded: false, checkinCompleted: true }),
    ).toBe(false);
  });

  it("exports stable provisional constants", () => {
    expect(PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION).toBe("hold_pending");
    expect(PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION).toBe("open_balance");
  });
});
