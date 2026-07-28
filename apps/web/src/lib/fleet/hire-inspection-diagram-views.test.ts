import { describe, expect, it } from "vitest";
import { diagramViewFromPoint } from "@/lib/fleet/hire-inspection-diagram-views";

describe("diagramViewFromPoint", () => {
  it("maps composite diagram regions", () => {
    expect(diagramViewFromPoint(537, 540)).toBe("top");
    expect(diagramViewFromPoint(1566, 130)).toBe("spare");
    expect(diagramViewFromPoint(294, 539)).toBe("front");
    expect(diagramViewFromPoint(1261, 157)).toBe("left_side");
    expect(diagramViewFromPoint(881, 979)).toBe("right_side");
    expect(diagramViewFromPoint(1631, 340)).toBe("rear");
  });

  it("keeps left outer tail light off the right front window band", () => {
    expect(diagramViewFromPoint(850, 373)).toBe("top");
    expect(diagramViewFromPoint(805, 387)).toBe("top");
    expect(diagramViewFromPoint(1338, 712)).toBe("top");
  });
});
