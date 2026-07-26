import { redirect } from "next/navigation";
import { cache } from "react";
import { getRentalCompanyGateCached } from "@/lib/auth/company-gate-cache";
import { resolveRentalContractAccess } from "@/lib/auth/rental-contract-access";
import { createClient } from "@/lib/supabase/server";

const getContractActive = cache(async (companyId: string) => {
  try {
    const gate = await getRentalCompanyGateCached(companyId);
    return gate.contractActive;
  } catch {
    const supabase = await createClient();
    const [{ data: co }, { data: cc, error }, { data: pendingAmendment }] = await Promise.all([
      supabase
        .from("companies")
        .select("rental_onboarding_completed_at, contract_status")
        .eq("id", companyId)
        .maybeSingle(),
      supabase.from("company_contracts").select("status").eq("parent_company_id", companyId).maybeSingle(),
      supabase
        .from("company_contract_change_requests")
        .select("id")
        .eq("parent_company_id", companyId)
        .eq("status", "pending_signature")
        .in("review_status", ["awaiting_signature", "approved"])
        .limit(1)
        .maybeSingle(),
    ]);
    const access = resolveRentalContractAccess({
      contractStatus: error ? null : ((cc?.status as string | undefined) ?? null),
      companyContractStatus: (co?.contract_status as string | undefined) ?? null,
      onboardingComplete: !!co?.rental_onboarding_completed_at,
      hasPendingAmendmentSignature: Boolean(pendingAmendment?.id),
    }).contractActive;
    return access;
  }
});

/** Server-only: send rental users to awaiting-contract until the parent agreement is active. */
export async function redirectIfRentalContractNotActive(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  const active = await getContractActive(id);
  if (!active) redirect("/rental/awaiting-contract");
}
