import { describe, expect, it } from "vitest";
import {
  clampHireFuelLevelPercent,
  formatHireFuelLevelPercent,
  isValidHireFuelLevelPercent,
} from "@/lib/fleet/hire-fuel-level";

describe("hire-fuel-level", () => {
  it("clamps and rounds fuel percent", () => {
    expect(clampHireFuelLevelPercent(47.6)).toBe(48);
    expect(clampHireFuelLevelPercent(-5)).toBe(0);
    expect(clampHireFuelLevelPercent(120)).toBe(100);
  });

  it("validates fuel percent", () => {
    expect(isValidHireFuelLevelPercent(null)).toBe(true);
    expect(isValidHireFuelLevelPercent(0)).toBe(true);
    expect(isValidHireFuelLevelPercent(100)).toBe(true);
    expect(isValidHireFuelLevelPercent(101)).toBe(false);
    expect(isValidHireFuelLevelPercent(12.5)).toBe(false);
  });

  it("formats fuel percent for display", () => {
    expect(formatHireFuelLevelPercent(null)).toBe("Not recorded");
    expect(formatHireFuelLevelPercent(63)).toBe("63%");
  });
});
