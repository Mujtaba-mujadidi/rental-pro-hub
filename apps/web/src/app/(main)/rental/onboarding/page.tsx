import { createClient } from "@/lib/supabase/server";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { redirectIfRentalOnboardingComplete } from "@/lib/auth/rental-onboarding";
import { RentalOnboardingWizard } from "./rental-onboarding-wizard";

export default async function RentalOnboardingPage() {
  const { profile } = await requireRentalCompanyArea();
  await redirectIfRentalOnboardingComplete(profile.company_id);

  const companyId = profile.company_id?.trim();
  if (!companyId) {
    return <p className="rph-muted text-sm">No company is linked to this account.</p>;
  }

  const supabase = await createClient();
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select(
      "id, name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, entity_type, trading_name, billing_email, logo_storage_path, rental_onboarding_step",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (cErr || !company) {
    return <p className="rph-alert-error text-sm">Could not load company ({cErr?.message ?? "not found"}).</p>;
  }

  const { data: primarySub } = await supabase
    .from("subcompanies")
    .select("id, name, display_name")
    .eq("parent_company_id", companyId)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <RentalOnboardingWizard
      initialStep={company.rental_onboarding_step ?? 0}
      company={company}
      primarySubcompany={primarySub}
    />
  );
}
