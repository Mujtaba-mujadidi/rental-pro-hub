import { describe, expect, it } from "vitest";
import { hireEsignTableStatus } from "@/lib/fleet/hire-contract-table-display";

describe("hireEsignTableStatus", () => {
  it("shows awaiting hirer after bundle is sent", () => {
    const status = hireEsignTableStatus({
      groupStatus: "pending_signature",
      agreementCount: 2,
      envelopeRows: [
        {
          agreementId: "a1",
          contractLengthKind: "annual",
          endDate: "2027-01-01",
          envelopeId: "env-1",
          status: "sent",
          requiresOwner: true,
          ownerSignedAt: "2026-01-01T10:00:00Z",
          fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, width: 1, height: 1, role: "recipient" }],
          signed: false,
        },
      ],
      signingBundleSentAt: "2026-01-02T10:00:00Z",
      allAgreementsSigned: false,
    });
    expect(status.label).toBe("Awaiting hirer");
  });

  it("shows ready to send when lessor has signed all agreements", () => {
    const status = hireEsignTableStatus({
      groupStatus: "pending_signature",
      agreementCount: 1,
      envelopeRows: [
        {
          agreementId: "a1",
          contractLengthKind: "annual",
          endDate: "2027-01-01",
          envelopeId: "env-1",
          status: "awaiting_placement",
          requiresOwner: true,
          ownerSignedAt: "2026-01-01T10:00:00Z",
          fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, width: 1, height: 1, role: "owner" }],
          signed: false,
        },
      ],
      signingBundleSentAt: null,
      allAgreementsSigned: false,
    });
    expect(status.label).toBe("Ready to send");
  });
});
