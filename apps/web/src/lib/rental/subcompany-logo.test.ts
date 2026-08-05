import { describe, expect, it } from "vitest";
import { isSubcompanyLogoPathOwned } from "@/lib/rental/subcompany-logo";

describe("isSubcompanyLogoPathOwned", () => {
  const parent = "11111111-1111-1111-1111-111111111111";
  const sub = "22222222-2222-2222-2222-222222222222";

  it("accepts tenant-owned logo paths", () => {
    expect(isSubcompanyLogoPathOwned(`${parent}/${sub}/logo.png`, parent, sub)).toBe(true);
  });

  it("rejects other tenants, traversal, and empty values", () => {
    expect(isSubcompanyLogoPathOwned(`${parent}/other/logo.png`, parent, sub)).toBe(false);
    expect(isSubcompanyLogoPathOwned(`${parent}/${sub}/../x.png`, parent, sub)).toBe(false);
    expect(isSubcompanyLogoPathOwned("", parent, sub)).toBe(false);
    expect(isSubcompanyLogoPathOwned(`${parent}/${sub}/logo.png`, "", sub)).toBe(false);
  });
});
