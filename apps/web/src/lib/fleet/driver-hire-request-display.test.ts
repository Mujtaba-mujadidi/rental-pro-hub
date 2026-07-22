import { describe, expect, it } from "vitest";
import { deriveDriverHireSigningSummary } from "@/lib/fleet/driver-hire-request-display";

describe("deriveDriverHireSigningSummary", () => {
  it("requires approved access before signing", () => {
    const summary = deriveDriverHireSigningSummary({
      accessRequestStatus: "pending",
      signingBundleSentAt: "2026-01-01T10:00:00Z",
      signingBundleExpiresAt: null,
      agreementCount: 1,
      signedCount: 0,
    });
    expect(summary.label).toBe("Approve access first");
    expect(summary.canOpenSigning).toBe(false);
  });

  it("shows continue signing when partially complete", () => {
    const summary = deriveDriverHireSigningSummary({
      accessRequestStatus: "approved",
      signingBundleSentAt: "2026-01-01T10:00:00Z",
      signingBundleExpiresAt: "2027-01-01T10:00:00Z",
      agreementCount: 2,
      signedCount: 1,
    });
    expect(summary.label).toBe("Continue signing (1/2)");
    expect(summary.canOpenSigning).toBe(true);
  });
});
