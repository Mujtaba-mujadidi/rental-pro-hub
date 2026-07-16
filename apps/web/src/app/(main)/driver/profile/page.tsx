import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import { type DriverOnboardingRow, driverOnboardingComplete } from "@/lib/driver/licence-check";
import { redirect } from "next/navigation";
import {
  DriverProfileTabs,
  type DriverProfilePreviousAddress,
  type DriverProfileTabsData,
  type DriverProfileLabels,
} from "./profile-tabs";

type DriverProfileRecord = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  address_town: string;
  address_county: string | null;
  address_postcode: string;
  address_verified_at: string | null;
  pending_address_line1: string | null;
  pending_address_line2: string | null;
  pending_address_town: string | null;
  pending_address_county: string | null;
  pending_address_postcode: string | null;
  pending_address_submitted_at: string | null;
  driving_licence_number: string | null;
  driving_licence_expiry: string | null;
  phv_licence_number: string | null;
  phv_licensing_authority: string | null;
  phv_licence_expiry: string | null;
  driving_licence_front_path: string | null;
  driving_licence_back_path: string | null;
  phv_licence_card_path: string | null;
  created_at: string;
  updated_at: string;
};

const DRIVER_PROFILE_SELECT =
  [
    "first_name",
    "last_name",
    "date_of_birth",
    "phone",
    "address_line1",
    "address_line2",
    "address_town",
    "address_county",
    "address_postcode",
    "address_verified_at",
    "pending_address_line1",
    "pending_address_line2",
    "pending_address_town",
    "pending_address_county",
    "pending_address_postcode",
    "pending_address_submitted_at",
    "driving_licence_number",
    "driving_licence_expiry",
    "phv_licence_number",
    "phv_licensing_authority",
    "phv_licence_expiry",
    "driving_licence_front_path",
    "driving_licence_back_path",
    "phv_licence_card_path",
    "created_at",
    "updated_at",
  ].join(", ");

function formatJoinedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function DriverProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user, profile } = await requireDriverArea();
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: raw, error } = await supabase
    .from("driver_profiles")
    .select(DRIVER_PROFILE_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="rph-h1">Your profile</h1>
        <p className="rph-alert-error">Could not load your profile: {error.message}</p>
      </div>
    );
  }

  const dp = raw as DriverProfileRecord | null;
  if (!driverOnboardingComplete(dp as unknown as DriverOnboardingRow) || !dp) {
    redirect("/driver/onboarding");
  }

  const { data: prevAddr } = await supabase
    .from("driver_address_history")
    .select("address_line1, address_line2, address_town, address_county, address_postcode, effective_to")
    .eq("user_id", user.id)
    .order("effective_to", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasPending = Boolean(dp.pending_address_submitted_at);
  const pendingLines = [
    dp.pending_address_line1,
    dp.pending_address_line2,
    dp.pending_address_town,
    dp.pending_address_county,
    dp.pending_address_postcode,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  const pendingFormatted = pendingLines.length > 0 ? pendingLines.join(", ") : "—";

  const drivingPhotos =
    Boolean(dp.driving_licence_front_path?.trim()) && Boolean(dp.driving_licence_back_path?.trim());
  const phvPhoto = Boolean(dp.phv_licence_card_path?.trim());

  const driverPayload: DriverProfileTabsData = {
    first_name: dp.first_name,
    last_name: dp.last_name,
    date_of_birth: dp.date_of_birth,
    phone: dp.phone,
    address_line1: dp.address_line1,
    address_line2: dp.address_line2,
    address_town: dp.address_town,
    address_county: dp.address_county,
    address_postcode: dp.address_postcode,
    hasPendingAddress: hasPending,
    pendingFormatted,
    driving_licence_number: dp.driving_licence_number,
    driving_licence_expiry: dp.driving_licence_expiry,
    phv_licence_number: dp.phv_licence_number,
    phv_licensing_authority: dp.phv_licensing_authority,
    phv_licence_expiry: dp.phv_licence_expiry,
    drivingPhotosOnFile: drivingPhotos,
    phvPhotoOnFile: phvPhoto,
  };

  const labels: DriverProfileLabels = {
    memberSince: formatJoinedAt(dp.created_at),
    profileUpdated: formatJoinedAt(dp.updated_at),
    addressConfirmed: dp.address_verified_at ? formatJoinedAt(dp.address_verified_at) : "—",
  };

  const previousAddress: DriverProfilePreviousAddress | null = prevAddr
    ? {
        line1: prevAddr.address_line1,
        line2: prevAddr.address_line2 ?? null,
        town: prevAddr.address_town,
        county: prevAddr.address_county ?? null,
        postcode: prevAddr.address_postcode,
        effectiveTo: prevAddr.effective_to ?? null,
      }
    : null;

  return (
    <DriverProfileTabs
      defaultTab={sp.tab}
      labels={labels}
      user={{ email: user.email ?? null }}
      profile={{ display_name: profile.display_name }}
      driver={driverPayload}
      previousAddress={previousAddress}
    />
  );
}
