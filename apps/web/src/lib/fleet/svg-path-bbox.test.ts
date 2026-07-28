import { describe, expect, it } from "vitest";
import { svgBBoxCenter, svgPathBBox } from "@/lib/fleet/svg-path-bbox";

describe("svgPathBBox", () => {
  it("handles absolute moveto and lineto", () => {
    const bbox = svgPathBBox("M10,20 L30,40");
    expect(bbox).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
  });

  it("handles relative cubic curves without negative phantom coords", () => {
    const bbox = svgPathBBox("M947.58,147.12l179.41-3.33c2.15-3.76,3.39-7.85,3.03-12.34");
    expect(bbox.minX).toBeGreaterThan(900);
    expect(bbox.maxX).toBeLessThan(1200);
    expect(bbox.minY).toBeGreaterThan(100);
    expect(bbox.maxY).toBeLessThan(200);
  });

  it("centers the left side passenger door on the side view, not the front bumper", () => {
    const doorPath =
      "M1088.06,181.66c6.27-6.69,13.42-12.8,20.33-18.71c2.4-2.05,4.79-4.1,7.14-6.17 c3.74-3.29,7.45-6.92,10.19-10.96l-178.47,3.31c-7.79,48.6-2.37,93.08-1.49,99.65l114.15-2.47c-0.29-21.21,9-43.39,26.26-62.59 C1086.8,183.02,1087.43,182.33,1088.06,181.66z";
    const center = svgBBoxCenter(svgPathBBox(doorPath));
    expect(center.x).toBeGreaterThan(950);
    expect(center.y).toBeGreaterThan(130);
    expect(center.y).toBeLessThan(250);
    expect(center.x).not.toBeCloseTo(333, 0);
    expect(center.y).not.toBeCloseTo(293, 0);
  });
});
