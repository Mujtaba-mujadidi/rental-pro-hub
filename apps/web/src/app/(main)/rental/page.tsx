import { createClient } from "@/lib/supabase/server";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { RentalContractDetailsCard } from "./rental-contract-details-card";
import { RentalDisplayNameSetting } from "./rental-display-name-setting";

export default async function RentalCompanyHomePage() {
  const { profile } = await requireRentalCompanyArea();
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, notes, contract_status, contract_version",
    )
    .eq("id", profile.company_id ?? "")
    .maybeSingle();
  const { data: pendingChange } = await supabase
    .from("company_contract_change_requests")
    .select("id, created_at, review_status, transition_type")
    .eq("parent_company_id", profile.company_id ?? "")
    .eq("status", "pending_signature")
    .neq("review_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: contractRow } = await supabase
    .from("company_contracts")
    .select("current_version_id")
    .eq("parent_company_id", profile.company_id ?? "")
    .maybeSingle();

  let termsSnapshot: Record<string, unknown> | null = null;
  const cvId = contractRow?.current_version_id;
  if (cvId) {
    const { data: verRow } = await supabase
      .from("company_contract_versions")
      .select("terms_snapshot")
      .eq("id", cvId)
      .maybeSingle();
    const raw = verRow?.terms_snapshot;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length > 0) {
      termsSnapshot = raw as Record<string, unknown>;
    }
  }

  const personalLabel =
    profile.display_name?.trim() || user?.email?.split("@")[0]?.trim() || "User";

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Company dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{personalLabel}</span>
        {company?.name ? (
          <>
            {" "}
            · <span className="rph-strong">{company.name}</span>
          </>
        ) : null}
      </p>
      <RentalDisplayNameSetting initialName={profile.display_name ?? ""} />
      <p className="rph-muted text-sm max-w-2xl">
        Your account is active. Rental company onboarding (branches, fleet, policies) can be added here next.
      </p>
      {company ? (
        <RentalContractDetailsCard
          company={company}
          termsSnapshot={termsSnapshot}
          hasPendingChange={!!pendingChange?.id || company.contract_status === "pending_renewal"}
          canRequestContractChange={
            profile.membership_role === "owner" || profile.membership_role === "admin"
          }
        />
      ) : null}
    </div>
  );
}
