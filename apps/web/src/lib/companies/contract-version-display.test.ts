import { describe, expect, it } from "vitest";
import {
  formatContractVersionStatus,
  isExecutedPreviousAgreementVersion,
  isIncompleteRenewalDraftVersion,
  mapContractVersionRowToMeta,
  maxCountedContractVersionNumber,
  nextContractVersionNumber,
  platformAgreementPdfFileName,
} from "@/lib/companies/contract-version-display";

describe("formatContractVersionStatus", () => {
  it("maps known statuses", () => {
    expect(formatContractVersionStatus("superseded")).toBe("Superseded");
    expect(formatContractVersionStatus("expired")).toBe("Expired");
  });

  it("falls back to a readable label", () => {
    expect(formatContractVersionStatus("signed_by_customer")).toBe("signed by customer");
  });
});

describe("mapContractVersionRowToMeta", () => {
  it("maps metadata and pdf availability without loading snapshots", () => {
    expect(
      mapContractVersionRowToMeta({
        id: "v1",
        version_number: 2,
        version_status: "superseded",
        superseded_at: "2026-07-20T12:00:00.000Z",
        signed_at: "2026-01-01T10:00:00.000Z",
        signed_by_customer_at: null,
        change_reason: "Legal detail change",
        rendered_pdf_storage_path: "env/signed.pdf",
      }),
    ).toMatchObject({
      id: "v1",
      versionNumber: 2,
      versionStatus: "superseded",
      hasPdf: true,
    });
  });

  it("marks hasPdf false when no storage path", () => {
    expect(
      mapContractVersionRowToMeta({
        id: "v2",
        version_number: 1,
        version_status: "legacy_import",
        rendered_pdf_storage_path: null,
      }).hasPdf,
    ).toBe(false);
  });
});

describe("platformAgreementPdfFileName", () => {
  it("uses version number in the download name", () => {
    expect(platformAgreementPdfFileName(3)).toBe("platform-agreement-v3.pdf");
  });
});

describe("isExecutedPreviousAgreementVersion", () => {
  it("excludes abandoned renewal drafts even when superseded", () => {
    expect(
      isExecutedPreviousAgreementVersion({
        id: "v3",
        versionNumber: 3,
        versionStatus: "superseded",
        supersededAt: "2026-07-25T19:30:00.000Z",
        signedAt: "2026-07-25T19:24:00.000Z",
        signedByCustomerAt: null,
        changeReason: "Legal detail change — pending customer signature",
        hasPdf: false,
      }),
    ).toBe(false);
  });

  it("includes customer-signed versions with a stored PDF", () => {
    expect(
      isExecutedPreviousAgreementVersion({
        id: "v2",
        versionNumber: 2,
        versionStatus: "superseded",
        supersededAt: "2026-07-20T12:00:00.000Z",
        signedAt: "2026-01-01T10:00:00.000Z",
        signedByCustomerAt: "2026-01-01T10:00:00.000Z",
        changeReason: "Legal detail change",
        hasPdf: true,
      }),
    ).toBe(true);
  });

  it("allows legacy superseded agreements with signed_at and stored PDF", () => {
    expect(
      isExecutedPreviousAgreementVersion({
        id: "v1",
        versionNumber: 1,
        versionStatus: "superseded",
        supersededAt: "2026-07-25T18:04:00.000Z",
        signedAt: "2026-07-17T17:27:00.000Z",
        signedByCustomerAt: null,
        changeReason: null,
        hasPdf: true,
      }),
    ).toBe(true);
  });

  it("excludes customer-signed rows without a stored PDF", () => {
    expect(
      isExecutedPreviousAgreementVersion({
        id: "v2",
        versionNumber: 2,
        versionStatus: "superseded",
        supersededAt: "2026-07-20T12:00:00.000Z",
        signedAt: "2026-01-01T10:00:00.000Z",
        signedByCustomerAt: "2026-01-01T10:00:00.000Z",
        changeReason: "Legal detail change",
        hasPdf: false,
      }),
    ).toBe(false);
  });
});

describe("isIncompleteRenewalDraftVersion", () => {
  it("treats pending customer signature drafts as incomplete", () => {
    expect(
      isIncompleteRenewalDraftVersion({
        versionNumber: 3,
        versionStatus: "superseded",
        changeReason: "Legal detail change — pending customer signature",
        hasPdf: false,
      }),
    ).toBe(true);
  });
});

describe("maxCountedContractVersionNumber", () => {
  it("returns the highest executed version only", () => {
    expect(
      maxCountedContractVersionNumber([
        { versionNumber: 1, versionStatus: "superseded", signedByCustomerAt: "2026-01-01", hasPdf: true },
        { versionNumber: 4, versionStatus: "superseded", changeReason: "Legal detail change — pending customer signature" },
      ]),
    ).toBe(1);
    expect(nextContractVersionNumber(1)).toBe(2);
  });
});
