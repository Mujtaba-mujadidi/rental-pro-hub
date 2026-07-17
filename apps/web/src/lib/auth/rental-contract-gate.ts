import { redirect } from "next/navigation";
import { cache } from "react";
import { getCachedCompanyGate } from "@/lib/auth/company-gate-cache";
import { createClient } from "@/lib/supabase/server";

const getContractActive = cache(async (companyId: string) => {
  try {
    const gate = await getCachedCompanyGate(companyId);
    return gate.contractActive;
  } catch {
    const supabase = await createClient();
    const { data: cc, error } = await supabase
      .from("company_contracts")
      .select("status")
      .eq("parent_company_id", companyId)
      .maybeSingle();
    return !error && (cc?.status as string | undefined) === "active";
  }
});

/** Server-only: send rental users to awaiting-contract until the parent agreement is active. */
export async function redirectIfRentalContractNotActive(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  const active = await getContractActive(id);
  if (!active) redirect("/rental/awaiting-contract");
}
