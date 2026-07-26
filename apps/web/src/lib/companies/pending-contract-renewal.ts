import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function pendingRenewalTag(companyId: string) {
  return `pending-renewal:${companyId}`;
}

export type PendingContractRenewal = {
  changeRequestId: string;
  envelopeId: string | null;
  envelopeStatus: string | null;
  signReady: boolean;
  signBlockedReason: string | null;
};

export async function loadPendingContractRenewal(
  admin: Admin,
  parentCompanyId: string,
): Promise<PendingContractRenewal | null> {
  const companyId = parentCompanyId.trim();
  if (!companyId) return null;

  const { data: change } = await admin
    .from("company_contract_change_requests")
    .select("id, esign_envelope_id")
    .eq("parent_company_id", companyId)
    .eq("status", "pending_signature")
    .in("review_status", ["awaiting_signature", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!change?.id) return null;

  let envelopeStatus: string | null = null;
  const envelopeId = (change.esign_envelope_id as string | null)?.trim() || null;
  if (envelopeId) {
    const { data: env } = await admin
      .from("esign_envelopes")
      .select("status")
      .eq("id", envelopeId)
      .maybeSingle();
    envelopeStatus = (env?.status as string | null) ?? null;
  }

  const signReady = envelopeStatus === "sent" || envelopeStatus === "viewed";
  let signBlockedReason: string | null = null;
  if (!envelopeId) {
    signBlockedReason = "Platform staff are still preparing your renewal contract.";
  } else if (envelopeStatus === "draft" || envelopeStatus === "awaiting_placement") {
    signBlockedReason = "Platform staff are still preparing your renewal contract.";
  } else if (envelopeStatus === "owner_signed") {
    signBlockedReason = "Waiting for the contract to be sent to you for signature.";
  } else if (envelopeStatus === "completed") {
    signBlockedReason = "This contract is already signed — refresh the page to restore access.";
  } else if (!signReady) {
    signBlockedReason = "Signing is not available yet.";
  }

  return {
    changeRequestId: change.id as string,
    envelopeId,
    envelopeStatus,
    signReady,
    signBlockedReason,
  };
}

/** Cross-request cache — layout + contract page share one renewal lookup per company. */
export function getCachedPendingContractRenewal(companyId: string): Promise<PendingContractRenewal | null> {
  const id = companyId.trim();
  if (!id) return Promise.resolve(null);

  const cached = unstable_cache(
    async () => {
      const admin = createSupabaseAdminClient();
      return loadPendingContractRenewal(admin, id);
    },
    ["pending-renewal", id],
    { revalidate: 30, tags: [pendingRenewalTag(id)] },
  );
  return cached();
}

/** One pending-renewal snapshot per RSC request. */
export const getPendingContractRenewalCached = cache((companyId: string) =>
  getCachedPendingContractRenewal(companyId),
);

export function revalidatePendingContractRenewal(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  revalidateTag(pendingRenewalTag(id), { expire: 0 });
}
