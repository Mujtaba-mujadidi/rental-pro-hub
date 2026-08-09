import { describe, expect, it } from "vitest";
import {
  bareVehicleTransferBlockedByHire,
  canExecuteVehicleSubcompanyTransfer,
  vehicleTransferBlockedMessage,
  vehicleTransferHirePhase,
} from "./vehicle-transfer-readiness";

describe("vehicleTransferHirePhase", () => {
  it("returns none when no hire", () => {
    expect(
      vehicleTransferHirePhase({
        hire: null,
        checkinCompleted: false,
        settlementSettled: false,
      }),
    ).toBe("none");
  });

  it("requires end contract for active hire", () => {
    expect(
      vehicleTransferHirePhase({
        hire: { id: "g1", status: "active" },
        checkinCompleted: false,
        settlementSettled: false,
      }),
    ).toBe("needs_end_contract");
  });

  it("requires check-in after provisional termination", () => {
    expect(
      vehicleTransferHirePhase({
        hire: { id: "g1", status: "terminated" },
        checkinCompleted: false,
        settlementSettled: false,
      }),
    ).toBe("needs_checkin");
  });

  it("requires settlement after check-in on terminated hire", () => {
    expect(
      vehicleTransferHirePhase({
        hire: { id: "g1", status: "terminated" },
        checkinCompleted: true,
        settlementSettled: false,
      }),
    ).toBe("needs_settlement");
  });

  it("is ready when terminated hire is fully closed", () => {
    expect(
      vehicleTransferHirePhase({
        hire: { id: "g1", status: "terminated" },
        checkinCompleted: true,
        settlementSettled: true,
      }),
    ).toBe("ready");
  });
});

describe("canExecuteVehicleSubcompanyTransfer", () => {
  it("allows none and ready phases", () => {
    expect(canExecuteVehicleSubcompanyTransfer("none")).toBe(true);
    expect(canExecuteVehicleSubcompanyTransfer("ready")).toBe(true);
    expect(canExecuteVehicleSubcompanyTransfer("needs_checkin")).toBe(false);
  });
});

describe("bareVehicleTransferBlockedByHire", () => {
  it("blocks when hire is in blocking status", () => {
    expect(bareVehicleTransferBlockedByHire({ id: "g1", status: "active" })).toBe(true);
    expect(bareVehicleTransferBlockedByHire({ id: "g1", status: "terminated" })).toBe(true);
    expect(bareVehicleTransferBlockedByHire(null)).toBe(false);
  });
});

describe("vehicleTransferBlockedMessage", () => {
  it("returns actionable copy per phase", () => {
    expect(vehicleTransferBlockedMessage("needs_end_contract")).toMatch(/end/i);
    expect(vehicleTransferBlockedMessage("needs_checkin")).toMatch(/check-in/i);
    expect(vehicleTransferBlockedMessage("needs_settlement")).toMatch(/settlement/i);
  });
});
