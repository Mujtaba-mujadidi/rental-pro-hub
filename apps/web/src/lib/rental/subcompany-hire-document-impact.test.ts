import { describe, expect, it } from "vitest";
import {
  affectedHireDocumentKey,
  agreementHasIssuedPdf,
  collectAffectedHireDocuments,
  hireIncludesContractImpact,
  hireQualifiesForSubcompanyDocumentImpact,
} from "@/lib/rental/subcompany-hire-document-impact";
import type { SubcompanyRow } from "@/lib/rental/subcompany";

const liveSubcompany = {
  id: "22222222-2222-2222-2222-222222222222",
  parent_company_id: "11111111-1111-1111-1111-111111111111",
  is_primary: false,
  name: "Branch",
  display_name: null,
  legal_name: "Branch Ltd",
  company_number: "12345678",
  registered_address_line1: "1 High Street",
  registered_address_line2: null,
  registered_town: "London",
  registered_county: null,
  registered_postcode: "SW1A1AA",
  country: "GB",
  primary_contact_first_name: "Ada",
  primary_contact_last_name: "Lovelace",
  primary_contact_dob: "1990-01-01",
  primary_contact_phone: "07000000000",
  primary_contact_email: "ada@example.com",
  status: "active",
  notes: null,
  logo_storage_path: "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/logo.png",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} satisfies SubcompanyRow;

describe("agreementHasIssuedPdf", () => {
  it("is false when no envelope, signature, or stored PDF", () => {
    expect(agreementHasIssuedPdf({})).toBe(false);
  });

  it("is true when an e-sign envelope exists", () => {
    expect(agreementHasIssuedPdf({ esign_envelope_id: "env-1" })).toBe(true);
  });
});

describe("hireQualifiesForSubcompanyDocumentImpact", () => {
  it("excludes non-active hires", () => {
    expect(
      hireQualifiesForSubcompanyDocumentImpact({
        status: "draft",
        issuedAgreementCount: 1,
        completedInspectionCount: 0,
      }),
    ).toBe(false);
  });

  it("excludes active hires with no issued documents", () => {
    expect(
      hireQualifiesForSubcompanyDocumentImpact({
        status: "active",
        issuedAgreementCount: 0,
        completedInspectionCount: 0,
      }),
    ).toBe(false);
  });

  it("excludes ended hires", () => {
    expect(
      hireQualifiesForSubcompanyDocumentImpact({
        status: "terminated",
        issuedAgreementCount: 1,
        completedInspectionCount: 0,
      }),
    ).toBe(false);
  });

  it("includes active hires with issued agreements or completed inspections", () => {
    expect(
      hireQualifiesForSubcompanyDocumentImpact({
        status: "active",
        issuedAgreementCount: 1,
        completedInspectionCount: 0,
      }),
    ).toBe(true);
    expect(
      hireQualifiesForSubcompanyDocumentImpact({
        status: "active",
        issuedAgreementCount: 0,
        completedInspectionCount: 1,
      }),
    ).toBe(true);
  });
});

describe("hireIncludesContractImpact", () => {
  it("detects logo path drift", () => {
    expect(hireIncludesContractImpact(liveSubcompany, { logo_storage_path: "old/path/logo.png" })).toBe(
      true,
    );
  });
});

describe("collectAffectedHireDocuments", () => {
  it("skips draft hires and active hires without issued PDFs", () => {
    const documents = collectAffectedHireDocuments({
      liveSubcompany,
      hires: [
        {
          id: "hire-draft",
          status: "draft",
          issuedAgreementCount: 0,
          completedInspectionCount: 0,
          subcompany_legal_snapshot: { logo_storage_path: "old/path/logo.png" },
          vrm: "MK67RWX",
        },
        {
          id: "hire-awaiting",
          status: "active",
          issuedAgreementCount: 0,
          completedInspectionCount: 0,
          subcompany_legal_snapshot: { logo_storage_path: "old/path/logo.png" },
          vrm: "MK67RWX",
        },
      ],
      agreements: [],
      inspections: [],
    });

    expect(documents).toEqual([]);
  });

  it("lists hire agreements, permission letters, and completed inspection reports", () => {
    const documents = collectAffectedHireDocuments({
      liveSubcompany,
      hires: [
        {
          id: "hire-1",
          status: "active",
          issuedAgreementCount: 2,
          completedInspectionCount: 1,
          subcompany_legal_snapshot: { logo_storage_path: "old/path/logo.png" },
          vrm: "AB12 CDE",
        },
      ],
      agreements: [
        {
          id: "agr-annual",
          hire_group_id: "hire-1",
          contract_length_kind: "annual",
          status: "active",
          esign_envelope_id: "env-1",
        },
        {
          id: "agr-custom",
          hire_group_id: "hire-1",
          contract_length_kind: "custom",
          status: "active",
          signed_at: "2026-01-02T00:00:00Z",
        },
        {
          id: "agr-draft",
          hire_group_id: "hire-1",
          contract_length_kind: "monthly",
          status: "active",
        },
      ],
      inspections: [
        {
          id: "insp-checkout",
          hire_group_id: "hire-1",
          kind: "checkout",
          status: "completed",
        },
      ],
    });

    expect(documents.map((doc) => doc.documentKind)).toEqual([
      "hire_agreement",
      "hire_agreement",
      "permission_letter",
      "inspection_checkout",
    ]);
    expect(documents[0]?.label).toContain("Hire agreement (annual)");
    expect(documents[2]?.label).toContain("Permission letter");
    expect(documents[3]?.label).toContain("Vehicle checkout report");
    expect(affectedHireDocumentKey(documents[0]!)).not.toBe(affectedHireDocumentKey(documents[1]!));
  });
});
