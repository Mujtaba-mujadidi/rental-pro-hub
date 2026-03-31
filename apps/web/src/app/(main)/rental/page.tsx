import { createClient } from "@/lib/supabase/server";
import { requireRentalCompanyArea } from "@/lib/auth/profile";

export default async function RentalCompanyHomePage() {
  const { profile } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id ?? "")
    .maybeSingle();

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Company dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{profile.display_name ?? "User"}</span>
        {company?.name ? (
          <>
            {" "}
            · <span className="rph-strong">{company.name}</span>
          </>
        ) : null}
      </p>
      <p className="rph-muted text-sm max-w-2xl">
        Your account is active. Rental company onboarding (branches, fleet, policies) can be added here next.
      </p>
    </div>
  );
}
