import { describe, expect, it } from "vitest";
import {
  canCompanyAccessHireDriverDocuments,
  driverDocumentsRetainUntilYmd,
  driverDocumentsRetentionWarning,
} from "@/lib/fleet/hire-document-retention";

describe("hire-document-retention", () => {
  it("adds retention months from termination date", () => {
    expect(driverDocumentsRetainUntilYmd("2026-01-15", 12)).toBe("2027-01-15");
  });

  it("gates company access after retain-until date", () => {
    expect(canCompanyAccessHireDriverDocuments("2026-12-31", "2026-12-30")).toBe(true);
    expect(canCompanyAccessHireDriverDocuments("2026-12-31", "2027-01-01")).toBe(false);
    expect(canCompanyAccessHireDriverDocuments(null, "2027-01-01")).toBe(true);
  });

  it("warns within 30 days and when expired", () => {
    expect(driverDocumentsRetentionWarning("2026-08-01", "2026-07-01")).toBeNull();
    expect(driverDocumentsRetentionWarning("2026-07-20", "2026-07-01")?.level).toBe("warning");
    expect(driverDocumentsRetentionWarning("2026-06-30", "2026-07-01")?.level).toBe("expired");
  });
});
