import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import {
  addressOnlyLicenceReview,
  driverLicenceReviewRequired,
  driverLicenceReviewSummaryLines,
} from "@/lib/driver/licence-attention";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverDrivingLicenceStepComplete,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { DriverLicencesPage } from "./ui";

async function signLicenceObjectUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await supabase.storage
    .from("driver-licences")
    .createSignedUrl(path.trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default async function DriverOnboardingPage() {
  const { user } = await requireDriverArea();

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("driver_profiles")
    .select(`updated_at, ${DRIVER_ONBOARDING_COLUMNS}`)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="rph-h1">Onboarding</h1>
        <p className="rph-alert-error">Could not load your profile: {error.message}</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="rph-h1">Onboarding</h1>
        <p className="rph-alert-error">
          No driver profile is linked to this account. Complete driver sign up first.
        </p>
        <Link href="/signup" className="rph-link-inline text-sm">
          Driver sign up
        </Link>
      </div>
    );
  }

  const complete = driverOnboardingComplete(row);
  const initialStep: 1 | 2 = complete
    ? 1
    : driverDrivingLicenceStepComplete(row)
      ? 2
      : 1;

  const [imageFront, imageBack, imagePhv] = await Promise.all([
    signLicenceObjectUrl(supabase, row.driving_licence_front_path),
    signLicenceObjectUrl(supabase, row.driving_licence_back_path),
    signLicenceObjectUrl(supabase, row.phv_licence_card_path),
  ]);

  const licenceAttentionLines =
    driverLicenceReviewRequired(row) ? driverLicenceReviewSummaryLines(row) : [];
  const addressOnlyAttention = addressOnlyLicenceReview(row);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="rph-h1">{complete ? "Licences & documents" : "Complete your onboarding"}</h1>
        <p className="rph-muted mt-1">
          {complete ? (
            <>
              Your details and photos are on file. Use <strong className="text-slate-700 dark:text-slate-300">View images</strong> to
              open your uploads, or <strong className="text-slate-700 dark:text-slate-300">Update licences</strong> to change details or
              replace photos.{" "}
              <Link href="/driver" className="rph-link-inline">
                Back to driver home
              </Link>
              .
            </>
          ) : (
            <>
              Complete two steps: driving licence (details and two photos), then PHV / taxi licence
              (details and one photo). You need to finish both before you can use the driver home page.
            </>
          )}
        </p>
      </div>
      <DriverLicencesPage
        addressOnlyAttention={addressOnlyAttention}
        licenceAttentionLines={licenceAttentionLines}
        licenceRevalidationDue={Boolean(row.licence_revalidation_due_at)}
        onboardingComplete={complete}
        initialStep={initialStep}
        imageUrls={{ front: imageFront, back: imageBack, phv: imagePhv }}
        initialRow={{
          driving_licence_number: row.driving_licence_number ?? null,
          driving_licence_expiry: row.driving_licence_expiry ?? null,
          phv_licence_number: row.phv_licence_number ?? null,
          phv_licensing_authority: row.phv_licensing_authority ?? null,
          phv_licence_expiry: row.phv_licence_expiry ?? null,
          driving_licence_front_path: row.driving_licence_front_path ?? null,
          driving_licence_back_path: row.driving_licence_back_path ?? null,
          phv_licence_card_path: row.phv_licence_card_path ?? null,
        }}
      />
    </div>
  );
}
