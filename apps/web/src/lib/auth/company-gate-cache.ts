import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import { resolveRentalContractAccess } from "@/lib/auth/rental-contract-access";
import { revalidatePendingContractRenewal } from "@/lib/companies/pending-contract-renewal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CompanyGateSnapshot = {
  companyName: string | null;
  deletionPhase: string;
  contractActive: boolean;
  onboardingComplete: boolean;
  /** Established tenant with an approved amendment awaiting customer signature. */
  renewalSignaturePending: boolean;
  fleetTrackingEnabled: boolean;
  registeredAddressLine1: string | null;
  registeredAddressLine2: string | null;
  registeredTown: string | null;
  registeredCounty: string | null;
  registeredPostcode: string | null;
};

function companyGateTag(companyId: string) {
  return `company-gate:${companyId}`;
}

/**
 * Cross-request cache for rental gate fields (name, deletion, contract, onboarding).
 * Uses service role so it can run inside `unstable_cache` (no cookies).
 * Populated on first request after login; busted immediately via `revalidateCompanyGate` on contract/onboarding changes.
 */
export function getCachedCompanyGate(companyId: string): Promise<CompanyGateSnapshot> {
  const id = companyId.trim();
  const cached = unstable_cache(
    async (): Promise<CompanyGateSnapshot> => {
      const admin = createSupabaseAdminClient();
      const [{ data: co }, { data: cc, error: ccErr }, { data: pendingAmendment }] = await Promise.all([
        admin
          .from("companies")
          .select(
            "name, deletion_phase, rental_onboarding_completed_at, contract_status, fleet_tracking_enabled, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode",
          )
          .eq("id", id)
          .maybeSingle(),
        admin.from("company_contracts").select("status").eq("parent_company_id", id).maybeSingle(),
        admin
          .from("company_contract_change_requests")
          .select("id")
          .eq("parent_company_id", id)
          .eq("status", "pending_signature")
          .in("review_status", ["awaiting_signature", "approved"])
          .limit(1)
          .maybeSingle(),
      ]);

      const onboardingComplete = !!co?.rental_onboarding_completed_at;
      const contractStatus = ccErr ? null : ((cc?.status as string | undefined) ?? null);
      const access = resolveRentalContractAccess({
        contractStatus,
        companyContractStatus: (co?.contract_status as string | undefined) ?? null,
        onboardingComplete,
        hasPendingAmendmentSignature: Boolean(pendingAmendment?.id),
      });

      return {
        companyName: (co?.name as string | null | undefined)?.trim() || null,
        deletionPhase: (co?.deletion_phase as string) ?? "active",
        contractActive: access.contractActive,
        onboardingComplete,
        renewalSignaturePending: access.renewalSignaturePending,
        fleetTrackingEnabled: Boolean(co?.fleet_tracking_enabled),
        registeredAddressLine1: (co?.registered_address_line1 as string | null) ?? null,
        registeredAddressLine2: (co?.registered_address_line2 as string | null) ?? null,
        registeredTown: (co?.registered_town as string | null) ?? null,
        registeredCounty: (co?.registered_county as string | null) ?? null,
        registeredPostcode: (co?.registered_postcode as string | null) ?? null,
      };
    },
    ["company-gate", id],
    { revalidate: 60, tags: [companyGateTag(id)] },
  );
  return cached();
}

/** One gate snapshot per RSC request (layout + page guards share the same values). */
export const getRentalCompanyGateCached = cache((companyId: string) => getCachedCompanyGate(companyId));

/** Bust gate cache after onboarding / contract / deletion-phase changes. */
export function revalidateCompanyGate(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  // Immediate expiry — gate redirects must not serve stale onboarding/contract state.
  revalidateTag(companyGateTag(id), { expire: 0 });
  revalidatePendingContractRenewal(id);
}
