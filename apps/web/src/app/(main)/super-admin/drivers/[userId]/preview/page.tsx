import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { DriverAddressSection } from "@/app/(main)/driver/driver-address-section";

export default async function AdminDriverPreviewDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const bundle = await loadDriverPreviewBundle(userId);
  if (!bundle) notFound();

  const dp = bundle.dp;
  const basePath = `/super-admin/drivers/${bundle.userId}/preview`;

  return (
    <div className="space-y-4">
      {!bundle.onboardingComplete ? (
        <p className="rph-alert-error text-sm">
          This driver has not finished onboarding. Data below may be incomplete.
        </p>
      ) : null}

      <h1 className="rph-h1">Dashboard</h1>
      <p className="rph-lead">
        Viewing <span className="rph-strong">{bundle.displayName?.trim() || "Driver"}</span>
      </p>
      <p className="rph-muted max-w-xl text-sm">
        <Link href={`${basePath}/licences`} className="rph-link-inline font-medium">
          Licences &amp; documents
        </Link>
        {" · "}
        <Link href={`${basePath}/profile`} className="rph-link-inline font-medium">
          Profile
        </Link>
      </p>
      <DriverAddressSection
        address_line1={dp.address_line1}
        address_line2={dp.address_line2}
        address_town={dp.address_town}
        address_county={dp.address_county}
        address_postcode={dp.address_postcode}
        previousAddress={bundle.previousAddress}
      />
    </div>
  );
}
