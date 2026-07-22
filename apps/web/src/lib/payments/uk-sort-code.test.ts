import { describe, expect, it } from "vitest";
import {
  formatUkSortCode,
  normalizeUkSortCodeForStorage,
  parseUkSortCodeDigits,
  splitUkSortCodeParts,
} from "@/lib/payments/uk-sort-code";

describe("parseUkSortCodeDigits", () => {
  it("keeps digits only and caps at 6", () => {
    expect(parseUkSortCodeDigits("12-34-56")).toBe("123456");
    expect(parseUkSortCodeDigits("12ab34cd56ef")).toBe("123456");
  });
});

describe("formatUkSortCode", () => {
  it("formats progressively", () => {
    expect(formatUkSortCode("1")).toBe("1");
    expect(formatUkSortCode("12")).toBe("12");
    expect(formatUkSortCode("123")).toBe("12-3");
    expect(formatUkSortCode("1234")).toBe("12-34");
    expect(formatUkSortCode("12345")).toBe("12-34-5");
    expect(formatUkSortCode("123456")).toBe("12-34-56");
  });
});

describe("splitUkSortCodeParts", () => {
  it("splits stored values into pairs", () => {
    expect(splitUkSortCodeParts("12-34-56")).toEqual(["12", "34", "56"]);
    expect(splitUkSortCodeParts("123456")).toEqual(["12", "34", "56"]);
  });
});

describe("normalizeUkSortCodeForStorage", () => {
  it("returns null for empty input", () => {
    expect(normalizeUkSortCodeForStorage("")).toBeNull();
    expect(normalizeUkSortCodeForStorage("  ")).toBeNull();
  });

  it("stores canonical dashed form", () => {
    expect(normalizeUkSortCodeForStorage("123456")).toBe("12-34-56");
  });
});
