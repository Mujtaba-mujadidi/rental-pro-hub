import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ESIGN_BUCKET } from "@/lib/esign/types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const PLATFORM_COMPANY_CONTRACT_CONTEXT = "platform_company_contract" as const;

const OPEN_PLATFORM_ESIGN_STATUSES = ["draft", "awaiting_placement", "owner_signed"] as const;

export type OpenAgreementChangeEsign = {
  changeRequestId: string;
  envelopeId: string | null;
  reviewStatus: string;
};

type ChangeRequestRow = {
  id: string;
  parent_company_id: string;
  esign_envelope_id: string | null;
  review_status: string;
  created_at: string;
};

/** Latest open legal-detail change request per company (pending customer signature). */
export async function loadOpenAgreementChangeEsignByCompanyIds(
  admin: Admin,
  companyIds: string[],
): Promise<Map<string, OpenAgreementChangeEsign>> {
  const out = new Map<string, OpenAgreementChangeEsign>();
  if (!companyIds.length) return out;

  const { data, error } = await admin
    .from("company_contract_change_requests")
    .select("id, parent_company_id, esign_envelope_id, review_status, created_at")
    .in("parent_company_id", companyIds)
    .eq("status", "pending_signature")
    .eq("transition_type", "detail_change")
    .neq("review_status", "rejected")
    .order("created_at", { ascending: false });

  if (error || !data) return out;

  for (const row of data as ChangeRequestRow[]) {
    const companyId = row.parent_company_id;
    if (!companyId || out.has(companyId)) continue;
    out.set(companyId, {
      changeRequestId: row.id,
      envelopeId: row.esign_envelope_id,
      reviewStatus: row.review_status,
    });
  }

  return out;
}

export async function findOpenAgreementChangeEsignForCompany(
  admin: Admin,
  companyId: string,
): Promise<OpenAgreementChangeEsign | null> {
  const map = await loadOpenAgreementChangeEsignByCompanyIds(admin, [companyId]);
  return map.get(companyId) ?? null;
}

export async function resolveLiveChangeRequestEnvelopeId(
  admin: Admin,
  envelopeId: string | null | undefined,
): Promise<string | null> {
  const id = envelopeId?.trim();
  if (!id) return null;

  const { data: env } = await admin.from("esign_envelopes").select("id, status").eq("id", id).maybeSingle();
  if (!env?.id || env.status === "void") return null;
  return env.id as string;
}

/** Remove stamped partial PDF bytes after regenerate (DB path is cleared separately). */
export async function discardPlatformEnvelopePartialPdf(
  admin: Admin,
  envelopeId: string,
  signedPdfPath?: string | null,
): Promise<void> {
  const paths = new Set<string>([`${envelopeId}/partial.pdf`]);
  const stored = signedPdfPath?.trim();
  if (stored) paths.add(stored);
  await admin.storage.from(ESIGN_BUCKET).remove([...paths]);
}

export async function voidOtherOpenPlatformEnvelopes(
  admin: Admin,
  parentCompanyId: string,
  keepEnvelopeId: string,
): Promise<void> {
  await admin
    .from("esign_envelopes")
    .update({ status: "void" })
    .eq("parent_company_id", parentCompanyId)
    .eq("context_type", PLATFORM_COMPANY_CONTRACT_CONTEXT)
    .neq("id", keepEnvelopeId)
    .in("status", [...OPEN_PLATFORM_ESIGN_STATUSES, "sent", "viewed"]);
}

export async function syncOpenChangeRequestEnvelopeLink(
  admin: Admin,
  parentCompanyId: string,
  envelopeId: string,
): Promise<void> {
  await admin
    .from("company_contract_change_requests")
    .update({ esign_envelope_id: envelopeId })
    .eq("parent_company_id", parentCompanyId)
    .eq("status", "pending_signature")
    .eq("transition_type", "detail_change")
    .neq("review_status", "rejected");
}

/**
 * One in-prep platform envelope per company. Prefer the newest live open envelope,
 * then sync the change-request link so Companies and Agreement change requests match.
 */
export async function resolveCanonicalPlatformEsignEnvelopeIds(
  admin: Admin,
  companyIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!companyIds.length) return out;

  const openChanges = await loadOpenAgreementChangeEsignByCompanyIds(admin, companyIds);
  const latestOpen = await loadOpenPlatformEsignEnvelopeByCompanyIds(admin, companyIds);

  const idsToCheck = new Set<string>();
  for (const companyId of companyIds) {
    const changeEnv = openChanges.get(companyId)?.envelopeId;
    const latestEnv = latestOpen.get(companyId);
    if (changeEnv) idsToCheck.add(changeEnv);
    if (latestEnv) idsToCheck.add(latestEnv);
  }

  const liveById = new Map<string, boolean>();
  if (idsToCheck.size > 0) {
    const { data } = await admin
      .from("esign_envelopes")
      .select("id, status")
      .in("id", [...idsToCheck]);
    for (const row of data ?? []) {
      const status = row.status as string;
      liveById.set(row.id as string, status !== "void" && status !== "completed");
    }
  }

  for (const companyId of companyIds) {
    const changeEnv = openChanges.get(companyId)?.envelopeId;
    const latestEnv = latestOpen.get(companyId);
    const latestOk = latestEnv && liveById.get(latestEnv);
    const changeOk = changeEnv && liveById.get(changeEnv);

    const winner = latestOk ? latestEnv! : changeOk ? changeEnv! : null;
    if (!winner) continue;

    out.set(companyId, winner);

    if (latestOk && changeOk && latestEnv !== changeEnv) {
      await voidOtherOpenPlatformEnvelopes(admin, companyId, winner);
    }
    if (openChanges.has(companyId)) {
      await syncOpenChangeRequestEnvelopeLink(admin, companyId, winner);
    }
  }

  return out;
}

export async function resolveCanonicalPlatformEsignEnvelopeId(
  admin: Admin,
  companyId: string,
): Promise<string | null> {
  const map = await resolveCanonicalPlatformEsignEnvelopeIds(admin, [companyId]);
  return map.get(companyId) ?? null;
}

/** Latest in-prep platform agreement envelope per company (not yet sent to customer). */
export async function loadOpenPlatformEsignEnvelopeByCompanyIds(
  admin: Admin,
  companyIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!companyIds.length) return out;

  const { data, error } = await admin
    .from("esign_envelopes")
    .select("id, parent_company_id, created_at")
    .in("parent_company_id", companyIds)
    .eq("context_type", "platform_company_contract")
    .in("status", [...OPEN_PLATFORM_ESIGN_STATUSES])
    .order("created_at", { ascending: false });

  if (error || !data) return out;

  for (const row of data) {
    const companyId = row.parent_company_id as string | null;
    const envelopeId = row.id as string | null;
    if (!companyId || !envelopeId || out.has(companyId)) continue;
    out.set(companyId, envelopeId);
  }

  return out;
}
