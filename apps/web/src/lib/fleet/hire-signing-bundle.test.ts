import { describe, expect, it } from "vitest";
import {
  countUnsignedHireBundleAgreements,
  hireBundleCurrentIndex,
  hireBundleSigningComplete,
  sortHireBundleAgreements,
  validateAllEnvelopesReadyForHireBundleSend,
  validateEnvelopeReadyForHireBundleSend,
} from "@/lib/fleet/hire-signing-bundle";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

const recipientSig: EsignFieldLayoutItem = {
  id: "r1",
  type: "signature",
  role: "recipient",
  page: 1,
  x: 0.1,
  y: 0.8,
  w: 0.2,
  h: 0.05,
};

describe("sortHireBundleAgreements", () => {
  it("orders annual before six months before custom", () => {
    const sorted = sortHireBundleAgreements([
      { contractLengthKind: "custom", endDate: "2027-01-01" },
      { contractLengthKind: "six_months", endDate: "2027-06-01" },
      { contractLengthKind: "annual", endDate: "2028-01-01" },
    ]);
    expect(sorted.map((s) => s.contractLengthKind)).toEqual(["annual", "six_months", "custom"]);
  });
});

describe("hireBundleCurrentIndex", () => {
  it("points at first unsigned agreement", () => {
    expect(hireBundleCurrentIndex([{ signed: true }, { signed: false }, { signed: false }])).toBe(1);
  });
  it("returns last index when all signed", () => {
    expect(hireBundleCurrentIndex([{ signed: true }, { signed: true }])).toBe(1);
  });
});

describe("hireBundleSigningComplete", () => {
  it("requires every agreement signed", () => {
    expect(hireBundleSigningComplete([{ signed: true }, { signed: false }])).toBe(false);
    expect(hireBundleSigningComplete([{ signed: true }])).toBe(true);
  });
});

describe("countUnsignedHireBundleAgreements", () => {
  it("counts pending signatures", () => {
    expect(countUnsignedHireBundleAgreements([{ signed: true }, { signed: false }])).toBe(1);
  });
});

describe("validateEnvelopeReadyForHireBundleSend", () => {
  it("requires recipient signature field", () => {
    const res = validateEnvelopeReadyForHireBundleSend({
      envelopeId: "e1",
      status: "awaiting_placement",
      requiresOwner: false,
      ownerSignedAt: null,
      fieldLayout: [],
    });
    expect(res.ok).toBe(false);
  });

  it("requires owner signature when configured", () => {
    const res = validateEnvelopeReadyForHireBundleSend({
      envelopeId: "e1",
      status: "awaiting_placement",
      requiresOwner: true,
      ownerSignedAt: null,
      fieldLayout: [recipientSig],
    });
    expect(res.ok).toBe(false);
  });

  it("passes when ready", () => {
    const res = validateEnvelopeReadyForHireBundleSend({
      envelopeId: "e1",
      status: "owner_signed",
      requiresOwner: true,
      ownerSignedAt: "2026-01-01T00:00:00Z",
      fieldLayout: [recipientSig],
    });
    expect(res.ok).toBe(true);
  });
});

describe("validateAllEnvelopesReadyForHireBundleSend", () => {
  it("skips already signed envelopes", () => {
    const res = validateAllEnvelopesReadyForHireBundleSend([
      {
        envelopeId: "e1",
        status: "completed",
        requiresOwner: true,
        ownerSignedAt: "x",
        fieldLayout: [recipientSig],
        signed: true,
      },
      {
        envelopeId: "e2",
        status: "owner_signed",
        requiresOwner: true,
        ownerSignedAt: "x",
        fieldLayout: [recipientSig],
        signed: false,
      },
    ]);
    expect(res.ok).toBe(true);
  });
});
