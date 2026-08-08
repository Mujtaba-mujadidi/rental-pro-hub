import { describe, expect, it } from "vitest";
import { isCompanyLogoPathOwned } from "@/lib/companies/company-logo";

describe("isCompanyLogoPathOwned", () => {
  const company = "11111111-1111-1111-1111-111111111111";

  it("accepts tenant-owned company logo paths", () => {
    expect(isCompanyLogoPathOwned(`${company}/logo.png`, company)).toBe(true);
    expect(isCompanyLogoPathOwned(`/${company}/logo.jpg`, company)).toBe(true);
  });

  it("rejects subcompany paths, traversal, and empty values", () => {
    expect(isCompanyLogoPathOwned(`${company}/sub/logo.png`, company)).toBe(false);
    expect(isCompanyLogoPathOwned(`${company}/../x.png`, company)).toBe(false);
    expect(isCompanyLogoPathOwned("", company)).toBe(false);
  });
});
