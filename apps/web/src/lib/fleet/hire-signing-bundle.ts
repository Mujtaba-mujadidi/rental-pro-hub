import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import { ESIGN_RECIPIENT_ROLE, layoutHasRoleSignature } from "@/lib/esign/roles";

const LENGTH_ORDER: Record<ContractLengthKind, number> = {
  annual: 0,
  six_months: 1,
  custom: 2,
};

export type HireBundleAgreementRef = {
  agreementId: string;
  contractLengthKind: ContractLengthKind;
  endDate: string;
  envelopeId: string;
  envelopeStatus: string;
  signed: boolean;
};

export function sortHireBundleAgreements<T extends { contractLengthKind: ContractLengthKind; endDate: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const oa = LENGTH_ORDER[a.contractLengthKind] ?? 99;
    const ob = LENGTH_ORDER[b.contractLengthKind] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.endDate.localeCompare(b.endDate);
  });
}

export function hireBundleSigningComplete(agreements: { signed: boolean }[]): boolean {
  return agreements.length > 0 && agreements.every((a) => a.signed);
}

/** Index of the next unsigned agreement, or last index when all signed. */
export function hireBundleCurrentIndex(agreements: { signed: boolean }[]): number {
  const idx = agreements.findIndex((a) => !a.signed);
  return idx === -1 ? Math.max(0, agreements.length - 1) : idx;
}

export function countUnsignedHireBundleAgreements(agreements: { signed: boolean }[]): number {
  return agreements.filter((a) => !a.signed).length;
}

export type EnvelopeBundleReadyResult =
  | { ok: true; envelopeId: string }
  | { ok: false; envelopeId: string; error: string };

export function validateEnvelopeReadyForHireBundleSend(input: {
  envelopeId: string;
  status: string;
  requiresOwner: boolean;
  ownerSignedAt: string | null;
  fieldLayout: EsignFieldLayoutItem[];
}): EnvelopeBundleReadyResult {
  const { envelopeId, status, requiresOwner, ownerSignedAt, fieldLayout } = input;
  const layout = Array.isArray(fieldLayout) ? fieldLayout : [];

  if (status === "completed" || status === "void" || status === "expired") {
    return { ok: false, envelopeId, error: "Envelope is closed." };
  }

  if (!layout.length) {
    return { ok: false, envelopeId, error: "Signature fields are not placed yet." };
  }
  if (!layoutHasRoleSignature(layout, ESIGN_RECIPIENT_ROLE)) {
    return { ok: false, envelopeId, error: "Add a hirer signature field." };
  }
  if (requiresOwner && !ownerSignedAt) {
    return { ok: false, envelopeId, error: "Lessor must sign before sending to the hirer." };
  }

  const sendableStatuses = new Set(["awaiting_placement", "owner_signed", "draft"]);
  if (!sendableStatuses.has(status)) {
    if (status === "sent" || status === "viewed") {
      return { ok: true, envelopeId };
    }
    return { ok: false, envelopeId, error: `Envelope is not ready to send (${status}).` };
  }

  return { ok: true, envelopeId };
}

export function validateAllEnvelopesReadyForHireBundleSend(
  envelopes: {
    envelopeId: string;
    status: string;
    requiresOwner: boolean;
    ownerSignedAt: string | null;
    fieldLayout: EsignFieldLayoutItem[];
    signed: boolean;
  }[],
): { ok: true } | { ok: false; error: string } {
  const pending = envelopes.filter((e) => !e.signed);
  if (!pending.length) {
    return { ok: false, error: "All agreements are already signed." };
  }

  for (const env of pending) {
    const check = validateEnvelopeReadyForHireBundleSend(env);
    if (!check.ok) return { ok: false, error: check.error };
  }
  return { ok: true };
}
