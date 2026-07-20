import { describe, expect, it } from "vitest";
import { generateAccessToken, generateOtp, hashSecret, safeEqualHash } from "@/lib/esign/crypto";

describe("hashSecret", () => {
  it("returns stable sha256 hex", () => {
    expect(hashSecret("secret")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSecret("secret")).toBe(hashSecret("secret"));
  });
});

describe("generateAccessToken / generateOtp", () => {
  it("returns expected formats", () => {
    expect(generateAccessToken().length).toBeGreaterThan(20);
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});

describe("safeEqualHash", () => {
  it("compares equal hex hashes", () => {
    const h = hashSecret("x");
    expect(safeEqualHash(h, h)).toBe(true);
    expect(safeEqualHash(h, hashSecret("y"))).toBe(false);
  });

  it("returns false for different-length digests", () => {
    expect(safeEqualHash("aa", "aabb")).toBe(false);
    expect(safeEqualHash("", hashSecret("x"))).toBe(false);
  });
});
