import { describe, expect, it } from "vitest";
import {
  resolveHireLessorDisplayName,
  resolveHireLessorMailIdentity,
} from "@/lib/rental/subcompany-legal-snapshot";

describe("resolveHireLessorDisplayName", () => {
  it("prefers subcompany snapshot over parent company", () => {
    expect(
      resolveHireLessorDisplayName({
        snapshot: { legal_name: "Regal Car Hire Limited" },
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Regal Car Hire Limited");
  });

  it("uses live subcompany fields when snapshot is empty", () => {
    expect(
      resolveHireLessorDisplayName({
        subcompany: { display_name: "Regal Car Hire", legal_name: "Regal Car Hire Limited" },
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Regal Car Hire Limited");
  });

  it("does not use parent company when subcompany exists but names are missing", () => {
    expect(
      resolveHireLessorDisplayName({
        subcompany: {},
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Rental company");
  });

  it("falls back to parent only for legacy hires without subcompany", () => {
    expect(
      resolveHireLessorDisplayName({
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: false,
      }),
    ).toBe("Oxus Cars Ltd");
  });
});

describe("resolveHireLessorMailIdentity", () => {
  it("uses live subcompany legal details when snapshot is not frozen yet", () => {
    expect(
      resolveHireLessorMailIdentity({
        subcompany: {
          legal_name: "Select Me Ltd",
          display_name: "Select Me",
          name: "Yama Farooq",
          company_number: "12345678",
          registered_address_line1: "10 Fleet Street",
          registered_town: "London",
          registered_postcode: "EC4A 1AA",
        },
        parentCompanyName: "Yama Farooq",
        hasSubcompany: true,
      }),
    ).toEqual({
      displayName: "Select Me Ltd",
      legalName: "Select Me Ltd",
      companyNumber: "12345678",
      address: "10 Fleet Street, London, EC4A 1AA",
    });
  });

  it("prefers snapshot company number and address for ended hires", () => {
    expect(
      resolveHireLessorMailIdentity({
        snapshot: {
          legal_name: "Oxus Cars Ltd",
          company_number: "87654321",
          registered_address_line1: "1 Oxus Road",
          registered_postcode: "B1 1AA",
        },
        hasSubcompany: true,
      }),
    ).toEqual({
      displayName: "Oxus Cars Ltd",
      legalName: "Oxus Cars Ltd",
      companyNumber: "87654321",
      address: "1 Oxus Road, B1 1AA",
    });
  });
});
