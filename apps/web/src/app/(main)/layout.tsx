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
  let fleetTrackingEnabled = false;
  let driverPendingHireRequests = 0;
  if (variant === "driver") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("driver_profiles")
      .select(DRIVER_ONBOARDING_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    const complete = driverOnboardingComplete(data);
    const review = complete && data && driverLicenceReviewRequired(data);
    driverNavMode = complete ? "full" : "onboarding";
    if (complete && data && review) {
      driverLicenceBanner = {
        title: "Reminder: update your licences",
        bullets: driverLicenceReviewSummaryLines(data),
      };
    }
    const { count } = await supabase
      .from("company_driver_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("driver_user_id", user.id)
      .eq("status", "pending");
    driverPendingHireRequests = count ?? 0;
  }
  if (variant === "rental_company") {
    const life = await getRentalSessionLifecycleCached(user.id, user.email);
    const personal =
      profile.display_name?.trim() || user.email?.split("@")[0]?.trim() || "User";
    accountDisplayName =
      life.kind === "rental" && life.companyName ? `${personal} · ${life.companyName}` : personal;

    const companyId = profile.company_id?.trim();
    if (companyId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("companies")
        .select("fleet_tracking_enabled")
        .eq("id", companyId)
        .maybeSingle();
      fleetTrackingEnabled = Boolean(data?.fleet_tracking_enabled);
    }
  }

  return (
    <Option7Shell
      variant={variant}
      displayName={accountDisplayName}
      driverNavMode={variant === "driver" ? driverNavMode : undefined}
      driverLicenceBanner={variant === "driver" ? driverLicenceBanner : null}
      driverPendingHireRequests={variant === "driver" ? driverPendingHireRequests : 0}
      fleetTrackingEnabled={fleetTrackingEnabled}
    >
      {children}
    </Option7Shell>
  );
}
