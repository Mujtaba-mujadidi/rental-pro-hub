import { describe, expect, it } from "vitest";
import {
  deriveHireEnvelopePreparationStatus,
  hireAgreementsToEnvelopeReadyRows,
  hireEnvelopePreparationLabel,
  pickPrepareEnvelopeId,
} from "@/lib/fleet/hire-envelope-readiness";

describe("hireAgreementsToEnvelopeReadyRows", () => {
  it("sorts agreements by contract length", () => {
    const rows = hireAgreementsToEnvelopeReadyRows([
      {
        id: "a2",
        contract_length_kind: "custom",
        end_date: "2027-01-01",
        esign_envelope_id: "env-2",
        esign_envelopes: { id: "env-2", status: "draft" },
      },
      {
        id: "a1",
        contract_length_kind: "annual",
        end_date: "2027-01-01",
        esign_envelope_id: "env-1",
        esign_envelopes: { id: "env-1", status: "draft" },
      },
    ]);
    expect(rows.map((r) => r.envelopeId)).toEqual(["env-1", "env-2"]);
  });
});

describe("deriveHireEnvelopePreparationStatus", () => {
  it("labels lessor-signed envelopes", () => {
    const status = deriveHireEnvelopePreparationStatus({
      envelopeId: "env-1",
      status: "awaiting_placement",
      requiresOwner: true,
      ownerSignedAt: "2026-01-01T10:00:00Z",
      fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, width: 1, height: 1, role: "owner" }],
      signed: false,
    });
    expect(status).toBe("lessor_signed");
    expect(hireEnvelopePreparationLabel(status)).toBe("Lessor signed");
  });

  it("labels awaiting lessor when owner signature is still required", () => {
    const status = deriveHireEnvelopePreparationStatus({
      envelopeId: "env-1",
      status: "awaiting_placement",
      requiresOwner: true,
      ownerSignedAt: null,
      fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, width: 1, height: 1, role: "owner" }],
      signed: false,
    });
    expect(status).toBe("awaiting_lessor");
  });
});

describe("pickPrepareEnvelopeId", () => {
  it("prefers envelopes still being laid out", () => {
    const id = pickPrepareEnvelopeId([
      {
        agreementId: "a1",
        contractLengthKind: "annual",
        endDate: "2027-01-01",
        envelopeId: "env-sent",
        status: "sent",
        requiresOwner: false,
        ownerSignedAt: null,
        fieldLayout: [],
        signed: false,
      },
      {
        agreementId: "a2",
        contractLengthKind: "six_months",
        endDate: "2027-01-01",
        envelopeId: "env-draft",
        status: "awaiting_placement",
        requiresOwner: false,
        ownerSignedAt: null,
        fieldLayout: [],
        signed: false,
      },
    ]);
    expect(id).toBe("env-draft");
  });
});
