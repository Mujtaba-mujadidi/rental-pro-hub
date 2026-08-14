import { describe, expect, it } from "vitest";
import {
  canPartyUploadHireInsurance,
  deriveHireInsuranceDocumentStatus,
  hireInsuranceAttentionMessage,
  isHireInsuranceType,
  mapHireInsuranceSummary,
} from "./hire-insurance";

describe("deriveHireInsuranceDocumentStatus", () => {
  it("returns not_configured when responsibility unset", () => {
    expect(
      deriveHireInsuranceDocumentStatus({
        providedBy: null,
        hasDocument: false,
        expiryDate: null,
        notifyDaysBefore: 28,
        todayYmd: "2026-08-09",
      }),
    ).toBe("not_configured");
  });

  it("returns awaiting_upload when configured but no file", () => {
    expect(
      deriveHireInsuranceDocumentStatus({
        providedBy: "driver",
        hasDocument: false,
        expiryDate: null,
        notifyDaysBefore: 28,
        todayYmd: "2026-08-09",
      }),
    ).toBe("awaiting_upload");
  });

  it("flags expiring within lead window", () => {
    expect(
      deriveHireInsuranceDocumentStatus({
        providedBy: "company",
        hasDocument: true,
        expiryDate: "2026-08-20",
        notifyDaysBefore: 28,
        todayYmd: "2026-08-09",
      }),
    ).toBe("expiring");
  });

  it("flags expired", () => {
    expect(
      deriveHireInsuranceDocumentStatus({
        providedBy: "company",
        hasDocument: true,
        expiryDate: "2026-08-01",
        notifyDaysBefore: 28,
        todayYmd: "2026-08-09",
      }),
    ).toBe("expired");
  });
});

describe("canPartyUploadHireInsurance", () => {
  it("allows only the responsible party", () => {
    expect(canPartyUploadHireInsurance({ providedBy: "driver", audience: "driver" })).toBe(true);
    expect(canPartyUploadHireInsurance({ providedBy: "driver", audience: "staff" })).toBe(false);
    expect(canPartyUploadHireInsurance({ providedBy: "company", audience: "staff" })).toBe(true);
    expect(canPartyUploadHireInsurance({ providedBy: "company", audience: "driver" })).toBe(false);
  });
});

describe("hireInsuranceAttentionMessage", () => {
  it("describes awaiting upload", () => {
    expect(
      hireInsuranceAttentionMessage({
        status: "awaiting_upload",
        providedBy: "driver",
        expiryDate: null,
        todayYmd: "2026-08-09",
      }),
    ).toMatch(/driver/i);
  });
});

describe("mapHireInsuranceSummary", () => {
  it("treats a row without a stored file as awaiting upload", () => {
    const summary = mapHireInsuranceSummary({
      providedBy: "driver",
      insuranceRow: {
        insurance_type: "tpo",
        expiry_date: "2027-01-01",
        file_name: null,
        file_path: "  ",
        uploaded_at: "2026-08-01T00:00:00.000Z",
        uploaded_by_role: "driver",
      },
      notifyDaysBefore: 28,
      audience: "staff",
      todayYmd: "2026-08-14",
    });
    expect(summary.hasDocument).toBe(false);
    expect(summary.status).toBe("awaiting_upload");
  });
});

describe("isHireInsuranceType", () => {
  it("accepts known types", () => {
    expect(isHireInsuranceType("tpo")).toBe(true);
    expect(isHireInsuranceType("fully_comprehensive")).toBe(true);
    expect(isHireInsuranceType("other")).toBe(false);
  });
});
