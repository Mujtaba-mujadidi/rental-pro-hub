import { notFound } from "next/navigation";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import {
  driverLicenceReviewRequired,
  driverLicenceReviewSummaryLines,
} from "@/lib/driver/licence-attention";
import {
  type DriverOnboardingRow,
  driverDrivingLicenceStepComplete,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { DriverLicencesPage } from "@/app/(main)/driver/onboarding/ui";

export default async function AdminDriverPreviewLicencesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const bundle = await loadDriverPreviewBundle(userId);
  if (!bundle) notFound();

  const dRow = bundle.dp as unknown as DriverOnboardingRow;
  const onboardingComplete = driverOnboardingComplete(dRow);
  const initialStep: 1 | 2 = onboardingComplete
    ? 1
    : dRow != null && driverDrivingLicenceStepComplete(dRow)
      ? 2
      : 1;

  const licenceAttentionLines = driverLicenceReviewRequired(dRow)
    ? driverLicenceReviewSummaryLines(dRow)
    : [];

  const r = bundle.dp as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="rph-h1">Licences &amp; documents</h1>
        <p className="rph-muted mt-1 text-sm">
          Full read-only view: numbers, dates, address checks, and stored photos (signed links refresh about every
          hour).
        </p>
      </div>
      <DriverLicencesPage
        adminPreview
        onboardingComplete={onboardingComplete}
        initialStep={initialStep}
        imageUrls={bundle.licenceImageUrls}
        licenceAttentionLines={licenceAttentionLines}
        licenceRevalidationDue={Boolean(r.licence_revalidation_due_at)}
        initialRow={{
          driving_licence_number: (r.driving_licence_number as string | null) ?? null,
          driving_licence_expiry: (r.driving_licence_expiry as string | null) ?? null,
          phv_licence_number: (r.phv_licence_number as string | null) ?? null,
          phv_licensing_authority: (r.phv_licensing_authority as string | null) ?? null,
          phv_licence_expiry: (r.phv_licence_expiry as string | null) ?? null,
          driving_licence_front_path: (r.driving_licence_front_path as string | null) ?? null,
          driving_licence_back_path: (r.driving_licence_back_path as string | null) ?? null,
          phv_licence_card_path: (r.phv_licence_card_path as string | null) ?? null,
          driving_address_confirmed_at: (r.driving_address_confirmed_at as string | null) ?? null,
          phv_address_confirmed_at: (r.phv_address_confirmed_at as string | null) ?? null,
          licence_revalidation_due_at: (r.licence_revalidation_due_at as string | null) ?? null,
          pending_address_submitted_at: (r.pending_address_submitted_at as string | null) ?? null,
          address_line1: (r.address_line1 as string | null) ?? null,
          address_line2: (r.address_line2 as string | null) ?? null,
          address_town: (r.address_town as string | null) ?? null,
          address_county: (r.address_county as string | null) ?? null,
          address_postcode: (r.address_postcode as string | null) ?? null,
          pending_address_line1: (r.pending_address_line1 as string | null) ?? null,
          pending_address_line2: (r.pending_address_line2 as string | null) ?? null,
          pending_address_town: (r.pending_address_town as string | null) ?? null,
          pending_address_county: (r.pending_address_county as string | null) ?? null,
          pending_address_postcode: (r.pending_address_postcode as string | null) ?? null,
        }}
      />
    </div>
  );
}
