import { Option7Shell } from "@/components/shell/option7-shell";
import { getAppProfile, getSessionUser } from "@/lib/auth/profile";
import { isSuperAdmin } from "@/lib/auth/roles";
import {
  driverLicenceReviewRequired,
  driverLicenceReviewSummaryLines,
} from "@/lib/driver/licence-attention";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MainShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getAppProfile();
  if (!profile) redirect("/login");

  const variant = isSuperAdmin(user.email, profile) ? "super_admin" : "driver";

  let driverNavMode: "onboarding" | "full" = "full";
  let driverLicenceBanner: { title: string; bullets: string[] } | null = null;
  if (variant === "driver") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("driver_profiles")
      .select(DRIVER_ONBOARDING_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    const complete = driverOnboardingComplete(data);
    const review = complete && data && driverLicenceReviewRequired(data);
    driverNavMode = complete && !review ? "full" : "onboarding";
    if (complete && data && review) {
      driverLicenceBanner = {
        title: "Action required: update your licences",
        bullets: driverLicenceReviewSummaryLines(data),
      };
    }
  }

  return (
    <Option7Shell
      variant={variant}
      displayName={profile.display_name}
      driverNavMode={variant === "driver" ? driverNavMode : undefined}
      driverLicenceBanner={variant === "driver" ? driverLicenceBanner : null}
    >
      {children}
    </Option7Shell>
  );
}
