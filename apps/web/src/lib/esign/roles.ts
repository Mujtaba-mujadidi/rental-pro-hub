import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export const ESIGN_OWNER_ROLE = "owner";
export const ESIGN_RECIPIENT_ROLE = "recipient";
/** Legacy single-signer layouts map to recipient. */
export const LEGACY_SIGNER_ROLE = "signer";

export function normalizeFieldRole(role: string | undefined | null): string {
  const r = role?.trim();
  if (!r || r === LEGACY_SIGNER_ROLE) return ESIGN_RECIPIENT_ROLE;
  return r;
}

export function fieldsForRole(layout: EsignFieldLayoutItem[], role: string): EsignFieldLayoutItem[] {
  const want = normalizeFieldRole(role);
  return layout.filter((f) => normalizeFieldRole(f.role) === want);
}

export function layoutHasRoleSignature(layout: EsignFieldLayoutItem[], role: string): boolean {
  return fieldsForRole(layout, role).some((f) => f.type === "signature" && !f.derivedFrom?.trim());
}

/** True when layout includes any owner signature placeholders (execution block or per-page paraphs). */
export function layoutIncludesOwnerSignFields(layout: EsignFieldLayoutItem[]): boolean {
  return layout.some(
    (f) => normalizeFieldRole(f.role) === ESIGN_OWNER_ROLE && f.type === "signature",
  );
}

export function filterLayoutForSignatureMode(
  layout: EsignFieldLayoutItem[],
  requiresOwner: boolean,
): EsignFieldLayoutItem[] {
  if (requiresOwner) return layout;
  return layout.filter((f) => normalizeFieldRole(f.role) !== ESIGN_OWNER_ROLE);
}
