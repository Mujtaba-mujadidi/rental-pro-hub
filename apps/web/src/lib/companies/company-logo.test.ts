import { describe, expect, it } from "vitest";
import { fitImageWithinBox } from "@/lib/companies/company-logo";

describe("fitImageWithinBox", () => {
  it("returns max box for non-positive source", () => {
    expect(fitImageWithinBox(0, 100, 140, 36)).toEqual({ width: 140, height: 36 });
    expect(fitImageWithinBox(100, -1, 140, 36)).toEqual({ width: 140, height: 36 });
  });

  it("does not upscale smaller images", () => {
    expect(fitImageWithinBox(70, 18, 140, 36)).toEqual({ width: 70, height: 18 });
  });

  it("scales down to fit width or height", () => {
    const wide = fitImageWithinBox(280, 36, 140, 36);
    expect(wide.width).toBeCloseTo(140);
    expect(wide.height).toBeCloseTo(18);

    const tall = fitImageWithinBox(70, 72, 140, 36);
    expect(tall.height).toBeCloseTo(36);
    expect(tall.width).toBeCloseTo(35);
  });
});
