import { describe, expect, it } from "vitest";
import { buildHireInsuranceAttentionItems } from "./hire-insurance-attention";

describe("buildHireInsuranceAttentionItems", () => {
  it("returns awaiting upload for responsible party hires", () => {
    const items = buildHireInsuranceAttentionItems({
      hireGroupId: "hg-1",
      audience: "staff",
      providedBy: "driver",
      hasDocument: false,
      expiryDate: null,
      notifyDaysBefore: 28,
      todayYmd: "2026-08-09",
      hireStatus: "active",
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("awaiting_insurance_upload");
    expect(items[0]?.href).toBe("/rental/hires/hg-1/details");
  });

  it("flags expiring insurance within lead window", () => {
    const items = buildHireInsuranceAttentionItems({
      hireGroupId: "hg-1",
      audience: "driver",
      providedBy: "company",
      hasDocument: true,
      expiryDate: "2026-08-20",
      notifyDaysBefore: 28,
      todayYmd: "2026-08-09",
      hireStatus: "active",
    });
    expect(items[0]?.kind).toBe("insurance_expiring");
    expect(items[0]?.href).toBe("/driver/hires/hg-1/details");
  });

  it("ignores ended hires", () => {
    expect(
      buildHireInsuranceAttentionItems({
        hireGroupId: "hg-1",
        audience: "staff",
        providedBy: "driver",
        hasDocument: false,
        expiryDate: null,
        notifyDaysBefore: 28,
        todayYmd: "2026-08-09",
        hireStatus: "ended",
      }),
    ).toEqual([]);
  });
});
