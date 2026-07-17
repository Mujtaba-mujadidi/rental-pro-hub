import { redirect } from "next/navigation";
import { cache } from "react";
import { getCachedCompanyGate } from "@/lib/auth/company-gate-cache";
import { createClient } from "@/lib/supabase/server";

const getCompanyOnboardingFlags = cache(async (companyId: string) => {
  try {
    const gate = await getCachedCompanyGate(companyId);
    return { complete: gate.onboardingComplete };
  } catch {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("rental_onboarding_completed_at")
      .eq("id", companyId)
      .maybeSingle();
    return { complete: Boolean(data?.rental_onboarding_completed_at) };
  }
});

export async function redirectIfRentalOnboardingIncomplete(companyId: string | null) {
  if (!companyId) return;
  const { complete } = await getCompanyOnboardingFlags(companyId);
  if (!complete) redirect("/rental/onboarding");
}

export async function redirectIfRentalOnboardingComplete(companyId: string | null) {
  if (!companyId) return;
  const { complete } = await getCompanyOnboardingFlags(companyId);
  if (complete) redirect("/rental");
}
