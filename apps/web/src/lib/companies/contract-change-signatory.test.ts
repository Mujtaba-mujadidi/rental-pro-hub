import { describe, expect, it } from "vitest";
import { resolveContractSignatoryFromSources } from "@/lib/companies/contract-change-signatory";

describe("resolveContractSignatoryFromSources", () => {
  it("uses explicit signatory when provided", () => {
    expect(
      resolveContractSignatoryFromSources({
        signatoryName: "Jane Signer",
        signatoryEmail: "jane@example.com",
        ownerDisplayName: "Owner Name",
        ownerEmail: "owner@example.com",
      }),
    ).toEqual({ name: "Jane Signer", email: "jane@example.com" });
  });

  it("defaults to owner name and email when signatory fields are empty", () => {
    expect(
      resolveContractSignatoryFromSources({
        ownerDisplayName: "Oxus Owner",
        ownerEmail: "owner@oxuscars.co.uk",
        primaryContactFirstName: "Primary",
        primaryContactLastName: "Contact",
        primaryContactEmail: "primary@oxuscars.co.uk",
      }),
    ).toEqual({ name: "Oxus Owner", email: "owner@oxuscars.co.uk" });
  });

  it("falls back to primary contact when owner is missing", () => {
    expect(
      resolveContractSignatoryFromSources({
        primaryContactFirstName: "Primary",
        primaryContactLastName: "Contact",
        primaryContactEmail: "primary@oxuscars.co.uk",
      }),
    ).toEqual({ name: "Primary Contact", email: "primary@oxuscars.co.uk" });
  });
});
