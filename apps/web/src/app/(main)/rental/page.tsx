import Link from "next/link";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalDisplayNameSetting } from "./rental-display-name-setting";

export default async function RentalCompanyHomePage() {
  const { profile } = await requireRentalCompanyArea();
  const user = await getSessionUser();
  const supabase = await createClient();
  const companyId = profile.company_id ?? "";

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

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
      <p className="rph-muted max-w-2xl text-sm">
        Your account is active. Manage fleet under{" "}
        <Link
          href="/rental/vehicles"
          className="font-medium text-rph-link underline-offset-2 hover:text-rph-link-hover hover:underline"
        >
          Vehicles
        </Link>
        . View your platform agreement or request a legal amendment on the{" "}
        <Link
          href="/rental/contract"
          className="font-medium text-rph-link underline-offset-2 hover:text-rph-link-hover hover:underline"
        >
          {rentalContractCopy.platformAgreementNav}
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
