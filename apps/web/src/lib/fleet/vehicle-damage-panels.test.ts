import { describe, expect, it } from "vitest";
import {
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  isValidVehicleDamagePanelId,
  panelPinOffset,
  VEHICLE_DAMAGE_PANELS,
} from "@/lib/fleet/vehicle-damage-panels";

describe("vehicle damage panels", () => {
  it("has unique panel ids", () => {
    const ids = VEHICLE_DAMAGE_PANELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves panel by id", () => {
    expect(getVehicleDamagePanel("front_bumper")?.label).toBe("Front Bumper");
    expect(getVehicleDamagePanel("left_side_driver_door")?.label).toBe("Left Side Driver Door");
    expect(getVehicleDamagePanel("right_side_passenger_door")?.label).toBe("Right Side Passenger Door");
    expect(isValidVehicleDamagePanelId("front_bumper")).toBe(true);
    expect(isValidVehicleDamagePanelId("invalid")).toBe(false);
  });

  it("formats labels", () => {
    expect(hireDamageTypeLabel("scratch")).toBe("Scratch");
    expect(hireDamageSeverityLabel("major")).toBe("Major");
  });

  it("offsets stacked pins", () => {
    expect(panelPinOffset(0)).toEqual({ dx: 0, dy: 0 });
    expect(panelPinOffset(1)).toEqual({ dx: 8, dy: -6 });
    expect(panelPinOffset(5)).toEqual(panelPinOffset(0));
  });
});
