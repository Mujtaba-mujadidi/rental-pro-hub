import { describe, expect, it } from "vitest";
import {
  getHireInspectionPanel,
  getHireInspectionPanelPin,
  HIRE_INSPECTION_PANELS,
  isValidHireInspectionPanelId,
  primaryHireInspectionPanelPin,
  primaryHireInspectionPanelView,
  resolveHireInspectionPanelHighlightView,
} from "@/lib/fleet/hire-inspection-diagram";

describe("hire-inspection-diagram", () => {
  it("loads the purchased panel catalog", () => {
    expect(HIRE_INSPECTION_PANELS.length).toBeGreaterThanOrEqual(60);
    expect(getHireInspectionPanel("front_bumper")?.label).toBe("Front Bumper");
    expect(getHireInspectionPanel("front_rear_window")?.label).toBe("Rear Windscreen");
    expect(getHireInspectionPanel("left_side_driver_door")?.label).toBe("Left Side Driver Door");
    expect(isValidHireInspectionPanelId("right_side_passenger_door")).toBe(true);
    expect(isValidHireInspectionPanelId("invalid")).toBe(false);
    expect(HIRE_INSPECTION_PANELS.every((panel) => panel.hits.length > 0)).toBe(true);
  });

  it("uses the native category view for damage markers", () => {
    const panel = getHireInspectionPanel("front_bonnet");
    expect(panel).not.toBeNull();
    expect(primaryHireInspectionPanelView(panel!)).toBe("front");
    expect(primaryHireInspectionPanelPin(panel!)).toEqual({ pinX: 201, pinY: 539 });
  });

  it("places the left outer tail light pin on the left side view", () => {
    const pin = getHireInspectionPanelPin("left_outer_tail_light", "left_side");
    expect(pin).not.toBeNull();
    expect(pin!.pinX).toBeGreaterThan(1200);
    expect(pin!.pinY).toBeLessThan(220);
  });

  it("centres roof and fender pins away from neighbouring panels", () => {
    const roof = getHireInspectionPanelPin("roof", "top");
    const bonnet = getHireInspectionPanelPin("front_bonnet", "top");
    const fender = getHireInspectionPanelPin("left_side_fender", "top");
    const wheel = getHireInspectionPanelPin("left_side_front_wheel", "top");

    expect(roof).toEqual({ pinX: 537, pinY: 540 });
    expect(bonnet!.pinY).toBeLessThan(roof!.pinY);
    expect(Math.abs(fender!.pinY - wheel!.pinY)).toBeGreaterThan(40);
  });

  it("resolves a single highlight view per panel", () => {
    const roof = getHireInspectionPanel("roof");
    expect(roof).not.toBeNull();
    expect(primaryHireInspectionPanelView(roof!)).toBe("top");
    expect(resolveHireInspectionPanelHighlightView("roof")).toBe("top");
    expect(resolveHireInspectionPanelHighlightView("roof", "left_side")).toBe("top");

    const driverDoor = getHireInspectionPanel("left_side_driver_door");
    expect(primaryHireInspectionPanelView(driverDoor!)).toBe("left_side");
    expect(resolveHireInspectionPanelHighlightView("left_side_driver_door", "left_side")).toBe(
      "left_side",
    );
  });
});
