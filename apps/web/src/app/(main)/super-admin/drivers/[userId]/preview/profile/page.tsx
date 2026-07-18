import { notFound } from "next/navigation";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { formatUkDateLong } from "@/lib/datetime/uk";
import {
  DriverProfileTabs,
  type DriverProfileLabels,
  type DriverProfileTabsData,
} from "@/app/(main)/driver/profile/profile-tabs";

function formatJoinedAt(iso: string | null | undefined): string {
  return formatUkDateLong(iso);
}

export default async function AdminDriverPreviewProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await params;
  const sp = await searchParams;
  const bundle = await loadDriverPreviewBundle(userId);
  if (!bundle) notFound();

  const dp = bundle.dp;
  const licencesHref = `/super-admin/drivers/${bundle.userId}/preview/licences`;

  const hasPending = Boolean(dp.pending_address_submitted_at);
  const pendingLines = [
    dp.pending_address_line1,
    dp.pending_address_line2,
    dp.pending_address_town,
    dp.pending_address_county,
    dp.pending_address_postcode,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const pendingFormatted = pendingLines.length > 0 ? pendingLines.join(", ") : "—";

  const drivingPhotos =
    Boolean(String(dp.driving_licence_front_path ?? "").trim()) &&
    Boolean(String(dp.driving_licence_back_path ?? "").trim());
  const phvPhoto = Boolean(String(dp.phv_licence_card_path ?? "").trim());

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

  return (
    <DriverProfileTabs
      readOnly
      previewFullLicencesHref={licencesHref}
      defaultTab={sp.tab}
      labels={labels}
      user={{ email: bundle.email }}
      profile={{ display_name: bundle.displayName }}
      driver={driverPayload}
      previousAddress={bundle.previousAddress}
    />
  );
}
