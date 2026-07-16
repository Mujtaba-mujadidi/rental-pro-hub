import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function redirectIfRentalOnboardingIncomplete(companyId: string | null) {
  if (!companyId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("rental_onboarding_completed_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!data?.rental_onboarding_completed_at) {
    redirect("/rental/onboarding");
  }
}

export async function redirectIfRentalOnboardingComplete(companyId: string | null) {
  if (!companyId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("rental_onboarding_completed_at")
    .eq("id", companyId)
    .maybeSingle();
  if (data?.rental_onboarding_completed_at) {
    redirect("/rental");
  }
}
