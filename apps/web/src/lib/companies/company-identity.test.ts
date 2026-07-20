import { describe, expect, it } from "vitest";
import {
  companyIdentitiesMatch,
  normalizeCompanyEmail,
  normalizeCompanyName,
  normalizeCompanyNumber,
} from "@/lib/companies/company-identity";

describe("normalizeCompanyName", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeCompanyName("  Acme   Rentals  ")).toBe("acme rentals");
  });
});

describe("normalizeCompanyEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeCompanyEmail("  Ops@Acme.COM ")).toBe("ops@acme.com");
  });
});

describe("normalizeCompanyNumber", () => {
  it("trims, uppercases, strips spaces", () => {
    expect(normalizeCompanyNumber(" 12 345 678 ")).toBe("12345678");
  });
});

describe("companyIdentitiesMatch", () => {
  it("matches on email when both set", () => {
    expect(
      companyIdentitiesMatch(
        { name: "A", primary_contact_email: "a@x.com" },
        { name: "B", primary_contact_email: "A@X.com" },
      ),
    ).toBe(true);
  });

  it("matches on company number when both set", () => {
    expect(
      companyIdentitiesMatch(
        { name: "A", company_number: "123" },
        { name: "B", company_number: " 123 " },
      ),
    ).toBe(true);
  });

  it("matches on normalized name", () => {
    expect(
      companyIdentitiesMatch({ name: "Acme  Ltd" }, { name: "acme ltd" }),
    ).toBe(true);
  });

  it("does not match when nothing aligns", () => {
    expect(
      companyIdentitiesMatch(
        { name: "A", primary_contact_email: "a@x.com", company_number: "1" },
        { name: "B", primary_contact_email: "b@x.com", company_number: "2" },
      ),
    ).toBe(false);
  });

  it("does not match on empty email/number alone", () => {
    expect(
      companyIdentitiesMatch(
        { name: "Different", primary_contact_email: "", company_number: "" },
        { name: "Other", primary_contact_email: null, company_number: null },
      ),
    ).toBe(false);
  });
});
