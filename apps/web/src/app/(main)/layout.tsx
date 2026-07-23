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
import { DRIVER_CURRENT_HIRE_STATUSES } from "@/lib/fleet/driver-hire-nav";
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
  let rentalUnreadNotifications = 0;
  let driverPendingHireRequests = 0;
  let driverHasCurrentHire = false;
  let driverUnreadNotifications = 0;
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
    const { count: currentHireCount } = await supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("driver_user_id", user.id)
      .in("status", [...DRIVER_CURRENT_HIRE_STATUSES]);
    driverHasCurrentHire = (currentHireCount ?? 0) > 0;

    const { count: unreadDriverNotifications } = await supabase
      .from("platform_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    driverUnreadNotifications = unreadDriverNotifications ?? 0;
  }
  if (variant === "rental_company") {
    const life = await getRentalSessionLifecycleCached(user.id, user.email);
    const personal =
      profile.display_name?.trim() || user.email?.split("@")[0]?.trim() || "User";
    accountDisplayName =
      life.kind === "rental" && life.companyName ? `${personal} · ${life.companyName}` : personal;

    const companyId = profile.company_id?.trim();
    const supabase = await createClient();
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select("fleet_tracking_enabled")
        .eq("id", companyId)
        .maybeSingle();
      fleetTrackingEnabled = Boolean(data?.fleet_tracking_enabled);
    }

    const { count: unreadNotifications } = await supabase
      .from("platform_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    rentalUnreadNotifications = unreadNotifications ?? 0;
  }

  return (
    <Option7Shell
      variant={variant}
      displayName={accountDisplayName}
      userId={user.id}
      driverNavMode={variant === "driver" ? driverNavMode : undefined}
      driverLicenceBanner={variant === "driver" ? driverLicenceBanner : null}
      driverPendingHireRequests={variant === "driver" ? driverPendingHireRequests : 0}
      driverHasCurrentHire={variant === "driver" ? driverHasCurrentHire : false}
      driverUnreadNotifications={variant === "driver" ? driverUnreadNotifications : 0}
      fleetTrackingEnabled={fleetTrackingEnabled}
      rentalUnreadNotifications={variant === "rental_company" ? rentalUnreadNotifications : 0}
    >
      {children}
    </Option7Shell>
  );
}
