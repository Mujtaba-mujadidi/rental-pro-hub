import { describe, expect, it } from "vitest";
import { buildHireInspectionDiagramPinMarkup } from "@/lib/fleet/hire-inspection-diagram-image";

describe("buildHireInspectionDiagramPinMarkup", () => {
  it("renders numbered pins with severity colours", () => {
    const markup = buildHireInspectionDiagramPinMarkup([
      {
        panelId: "front_bumper",
        severity: "minor",
        listIndex: 0,
      },
      {
        panelId: "front_bumper",
        pinX: 120,
        pinY: 80,
        severity: "major",
        listIndex: 1,
      },
    ]);

    expect(markup).toContain('fill="#f59e0b"');
    expect(markup).toContain('fill="#ef4444"');
    expect(markup).toContain(">1<");
    expect(markup).toContain(">2<");
    expect(markup).toContain('cx="128"');
  });

  it("returns empty string when pin position cannot be resolved", () => {
    const markup = buildHireInspectionDiagramPinMarkup([
      {
        panelId: "not_a_real_panel",
        severity: "moderate",
        listIndex: 0,
      },
    ]);
    expect(markup).toBe("");
  });
});
