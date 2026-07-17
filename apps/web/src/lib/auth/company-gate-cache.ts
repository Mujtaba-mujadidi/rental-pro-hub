import { unstable_cache, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CompanyGateSnapshot = {
  companyName: string | null;
  deletionPhase: string;
  contractActive: boolean;
  onboardingComplete: boolean;
};

function companyGateTag(companyId: string) {
  return `company-gate:${companyId}`;
}

/**
 * Cross-request cache for rental gate fields (name, deletion, contract, onboarding).
 * Uses service role so it can run inside `unstable_cache` (no cookies).
 * TTL is short; mutations call `revalidateCompanyGate`.
 */
export function getCachedCompanyGate(companyId: string): Promise<CompanyGateSnapshot> {
  const id = companyId.trim();
  const cached = unstable_cache(
    async (): Promise<CompanyGateSnapshot> => {
      const admin = createSupabaseAdminClient();
      const [{ data: co }, { data: cc, error: ccErr }] = await Promise.all([
        admin
          .from("companies")
          .select("name, deletion_phase, rental_onboarding_completed_at")
          .eq("id", id)
          .maybeSingle(),
        admin.from("company_contracts").select("status").eq("parent_company_id", id).maybeSingle(),
      ]);

      return {
        companyName: (co?.name as string | null | undefined)?.trim() || null,
        deletionPhase: (co?.deletion_phase as string) ?? "active",
        contractActive: !ccErr && (cc?.status as string | undefined) === "active",
        onboardingComplete: !!co?.rental_onboarding_completed_at,
      };
    },
    ["company-gate", id],
    { revalidate: 60, tags: [companyGateTag(id)] },
  );
  return cached();
}

/** Bust gate cache after onboarding / contract / deletion-phase changes. */
export function revalidateCompanyGate(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  // Immediate expiry — gate redirects must not serve stale onboarding/contract state.
  revalidateTag(companyGateTag(id), { expire: 0 });
}
