import { describe, expect, it } from "vitest";
import { staffCanAccessHireSubcompany } from "./rental-subcompany-access";

describe("staffCanAccessHireSubcompany", () => {
  it("allows every hire when the member has all-subcompany scope", () => {
    expect(staffCanAccessHireSubcompany("all", "sub-a")).toBe(true);
    expect(staffCanAccessHireSubcompany("all", null)).toBe(true);
    expect(staffCanAccessHireSubcompany("all", "")).toBe(true);
  });

  it("allows only granted subcompanies for explicit scope", () => {
    expect(staffCanAccessHireSubcompany(["sub-a", "sub-b"], "sub-a")).toBe(true);
    expect(staffCanAccessHireSubcompany(["sub-a"], "sub-b")).toBe(false);
    expect(staffCanAccessHireSubcompany(["sub-a"], null)).toBe(false);
    expect(staffCanAccessHireSubcompany([], "sub-a")).toBe(false);
  });
});
