import { Option7Shell } from "@/components/shell/option7-shell";
import { getAppProfile, getSessionUser } from "@/lib/auth/profile";
import { isSuperAdmin } from "@/lib/auth/roles";
import { getRentalSessionLifecycleCached } from "@/lib/auth/rental-lifecycle";
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

  const variant = isSuperAdmin(user.email, profile)
    ? "super_admin"
    : profile.role === "rental_company"
      ? "rental_company"
      : "driver";
  let accountDisplayName = profile.display_name;

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
    // Onboarding completion is the only gating condition. Licence review is a reminder, not a lockout.
    driverNavMode = complete ? "full" : "onboarding";
    if (complete && data && review) {
      driverLicenceBanner = {
        title: "Reminder: update your licences",
        bullets: driverLicenceReviewSummaryLines(data),
      };
    }
  }

  if (variant === "rental_company") {
    const life = await getRentalSessionLifecycleCached(user.id, user.email);
    const personal =
      profile.display_name?.trim() || user.email?.split("@")[0]?.trim() || "User";
    accountDisplayName =
      life.kind === "rental" && life.companyName ? `${personal} · ${life.companyName}` : personal;
  }

  return (
    <Option7Shell
      variant={variant}
      displayName={accountDisplayName}
      driverNavMode={variant === "driver" ? driverNavMode : undefined}
      driverLicenceBanner={variant === "driver" ? driverLicenceBanner : null}
    >
      {children}
    </Option7Shell>
  );
}
