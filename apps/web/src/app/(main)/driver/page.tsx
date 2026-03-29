import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import {
  DRIVER_ADDRESS_COLUMNS,
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { driverLicenceReviewRequired } from "@/lib/driver/licence-attention";
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

  if (driverLicenceReviewRequired(dp)) {
    redirect("/driver/onboarding");
  }

  if (!dp) {
    redirect("/driver/onboarding");
  }

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{profile.display_name ?? "Driver"}</span>.
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
      />
    </div>
  );
}
