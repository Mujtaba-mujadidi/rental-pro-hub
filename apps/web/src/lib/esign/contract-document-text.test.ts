import { describe, expect, it } from "vitest";
import { buildContractPdfDocument } from "@/lib/esign/contract-document-text";
import { buildPlatformCompanyContractPdfDocument } from "@/lib/esign/platform-contract-pdf";

describe("buildContractPdfDocument letterhead", () => {
  const legalSnapshot = {
    name: "Oxus Cars Ltd",
    company_number: "12518324",
    primary_contact_email: "admin@oxuscars.co.uk",
    primary_contact_phone: "+44 7459 923989",
  };

  it("uses explicit platform letterhead instead of customer contact on the PDF header", () => {
    const doc = buildContractPdfDocument({
      termsSnapshot: { title: "Platform services agreement", body: "Terms." },
      commercialSnapshot: {},
      legalSnapshot,
      companyName: "Oxus Cars Ltd",
      letterhead: {
        name: "Rental Pro Hub",
        companyNumber: "99999999",
        contactEmail: "legal@rentalprohub.com",
        contactPhone: "+44 20 0000 0000",
      },
    });

    expect(doc.platformName).toBe("Rental Pro Hub");
    expect(doc.companyNumber).toBe("99999999");
    expect(doc.contactEmail).toBe("legal@rentalprohub.com");
    expect(doc.contactPhone).toBe("+44 20 0000 0000");
    expect(doc.parties.find((p) => p.roleLabel === "Customer")?.name).toContain("Oxus");
  });

  it("falls back to combined address field in customer party lines", () => {
    const doc = buildContractPdfDocument({
      termsSnapshot: { title: "Platform services agreement", body: "Terms." },
      commercialSnapshot: {},
      legalSnapshot: {
        name: "Oxus Cars Ltd",
        address: "1 High Street, London, E1 2AB",
      },
      letterhead: {
        name: "Rental Pro Hub",
        companyNumber: "111",
        contactEmail: "ops@rph.test",
        contactPhone: null,
      },
    });

    const customer = doc.parties.find((p) => p.roleLabel === "Customer");
    expect(customer?.lines.some((line) => line.includes("1 High Street"))).toBe(true);
  });
});

describe("buildPlatformCompanyContractPdfDocument", () => {
  it("defaults letterhead to the platform operator, not the customer", () => {
    const doc = buildPlatformCompanyContractPdfDocument({
      termsSnapshot: { title: "Platform services agreement", body: "Terms." },
      commercialSnapshot: {},
      legalSnapshot: {
        name: "Oxus Cars Ltd",
        company_number: "12518324",
        primary_contact_email: "admin@oxuscars.co.uk",
      },
      customerCompanyName: "Oxus Cars Ltd",
      letterhead: {
        name: "Rental Pro Hub",
        companyNumber: "111",
        contactEmail: "ops@rph.test",
        contactPhone: null,
      },
    });

    expect(doc.platformName).toBe("Rental Pro Hub");
    expect(doc.companyNumber).toBe("111");
    expect(doc.contactEmail).toBe("ops@rph.test");
    expect(doc.companyNumber).not.toBe("12518324");
    expect(doc.contactEmail).not.toBe("admin@oxuscars.co.uk");
  });
});
