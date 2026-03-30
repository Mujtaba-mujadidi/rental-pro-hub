import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import {
  DRIVER_ADDRESS_COLUMNS,
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DriverAddressSection } from "./driver-address-section";

export default async function DriverHomePage() {
  const { user, profile } = await requireDriverArea();

  const supabase = await createClient();
  const { data: dp } = await supabase
    .from("driver_profiles")
    .select(`${DRIVER_ONBOARDING_COLUMNS}, ${DRIVER_ADDRESS_COLUMNS}`)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!driverOnboardingComplete(dp)) {
    redirect("/driver/onboarding");
  }

  if (!dp) {
    redirect("/driver/onboarding");
  }

  const { data: prevAddr } = await supabase
    .from("driver_address_history")
    .select("address_line1, address_line2, address_town, address_county, address_postcode, effective_to")
    .eq("user_id", user.id)
    .order("effective_to", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{profile.display_name ?? "Driver"}</span>
        {" · "}
        <Link href="/driver/profile" className="rph-link-inline text-base font-normal">
          View profile
        </Link>
      </p>
      <p className="rph-muted max-w-xl text-sm">
        Your licence details and document photos are on file. To update them, open{" "}
        <span className="rph-strong">Licences</span> in the sidebar.
      </p>
      <DriverAddressSection
        address_line1={dp.address_line1}
        address_line2={dp.address_line2}
        address_town={dp.address_town}
        address_county={dp.address_county}
        address_postcode={dp.address_postcode}
        previousAddress={
          prevAddr
            ? {
                line1: prevAddr.address_line1,
                line2: prevAddr.address_line2 ?? null,
                town: prevAddr.address_town,
                county: prevAddr.address_county ?? null,
                postcode: prevAddr.address_postcode,
                effectiveTo: prevAddr.effective_to ?? null,
              }
            : null
        }
      />
    </div>
  );
}
