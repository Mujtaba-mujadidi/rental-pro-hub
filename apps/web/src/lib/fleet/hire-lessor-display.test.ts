import { describe, expect, it } from "vitest";
import {
  resolveEffectiveHireLessorSubcompanyId,
  resolveHireLessorDisplayName,
  resolveHireLessorMailIdentity,
  shouldUseFrozenLessorSnapshot,
} from "@/lib/rental/subcompany-legal-snapshot";

describe("resolveEffectiveHireLessorSubcompanyId", () => {
  it("prefers the vehicle operating subcompany over a stale hire group value", () => {
    expect(
      resolveEffectiveHireLessorSubcompanyId({
        hireGroupSubcompanyId: "primary-sub",
        vehicleSubcompanyId: "select-me-sub",
      }),
    ).toBe("select-me-sub");
  });

  it("falls back to the hire group when the vehicle has no subcompany", () => {
    expect(
      resolveEffectiveHireLessorSubcompanyId({
        hireGroupSubcompanyId: "primary-sub",
        vehicleSubcompanyId: null,
      }),
    ).toBe("primary-sub");
  });
});

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
        useSnapshot: true,
      }),
    ).toEqual({
      displayName: "Oxus Cars Ltd",
      legalName: "Oxus Cars Ltd",
      companyNumber: "87654321",
      address: "1 Oxus Road, B1 1AA",
    });
  });

  it("ignores stale primary-company snapshot when live subcompany differs", () => {
    expect(
      resolveHireLessorMailIdentity({
        snapshot: {
          legal_name: "Yama Farooq",
          company_number: "15972083",
          registered_address_line1: "20 Manor Gardens",
        },
        subcompany: {
          legal_name: "Select Me Ltd",
          name: "Select Me",
          company_number: "99887766",
          registered_address_line1: "1 High Street",
          registered_town: "London",
          registered_postcode: "SW1A 1AA",
        },
        parentCompanyName: "Yama Farooq",
        hasSubcompany: true,
        useSnapshot: false,
      }),
    ).toEqual({
      displayName: "Select Me Ltd",
      legalName: "Select Me Ltd",
      companyNumber: "99887766",
      address: "1 High Street, London, SW1A 1AA",
    });
  });
});

describe("shouldUseFrozenLessorSnapshot", () => {
  it("never uses snapshot on draft hires", () => {
    expect(
      shouldUseFrozenLessorSnapshot({
        hireStatus: "draft",
        snapshot: { legal_name: "Yama Farooq", company_number: "15972083" },
        subcompany: { legal_name: "Select Me Ltd", company_number: "99887766" },
      }),
    ).toBe(false);
  });

  it("uses matching snapshot on signed hires", () => {
    expect(
      shouldUseFrozenLessorSnapshot({
        hireStatus: "active",
        snapshot: { legal_name: "Select Me Ltd", company_number: "99887766" },
        subcompany: { legal_name: "Select Me Ltd", company_number: "99887766" },
      }),
    ).toBe(true);
  });
});
