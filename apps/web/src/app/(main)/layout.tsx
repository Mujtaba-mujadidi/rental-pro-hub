import { Option7Shell } from "@/components/shell/option7-shell";
import { getAppProfile, getSessionUser } from "@/lib/auth/profile";
import { isSuperAdmin } from "@/lib/auth/roles";
import { getRentalSessionLifecycleCached } from "@/lib/auth/rental-lifecycle";
import { getPendingContractRenewalCached } from "@/lib/companies/pending-contract-renewal";
import { formatRegisteredCompanyAddress } from "@/lib/companies/registered-address";
import { getUnreadNotificationCountCached } from "@/lib/platform-notifications-read-cache";
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
  let rentalRenewalBanner: { signReady: boolean; signBlockedReason: string | null } | null = null;
  let rentalCompanyHeader: { name: string; address: string | null } | null = null;
  let driverPendingHireRequests = 0;
  let driverHasCurrentHire = false;
  let driverCurrentHireGroupId: string | null = null;
  let driverUnreadNotifications = 0;
  if (variant === "driver") {
    const supabase = await createClient();
    const [
      { data },
      { count },
      { data: currentHires },
      unreadNotifications,
    ] = await Promise.all([
      supabase.from("driver_profiles").select(DRIVER_ONBOARDING_COLUMNS).eq("user_id", user.id).maybeSingle(),
      supabase
        .from("company_driver_access_requests")
        .select("id", { count: "exact", head: true })
        .eq("driver_user_id", user.id)
        .eq("status", "pending"),
      supabase
        .from("vehicle_hire_groups")
        .select("id")
        .eq("driver_user_id", user.id)
        .in("status", [...DRIVER_CURRENT_HIRE_STATUSES])
        .order("start_date", { ascending: false })
        .limit(1),
      getUnreadNotificationCountCached(user.id),
    ]);
    const complete = driverOnboardingComplete(data);
    const review = complete && data && driverLicenceReviewRequired(data);
    driverNavMode = complete ? "full" : "onboarding";
    if (complete && data && review) {
      driverLicenceBanner = {
        title: "Reminder: update your licences",
        bullets: driverLicenceReviewSummaryLines(data),
      };
    }
    driverPendingHireRequests = count ?? 0;
    driverCurrentHireGroupId = currentHires?.[0]?.id ?? null;
    driverHasCurrentHire = Boolean(driverCurrentHireGroupId);
    driverUnreadNotifications = unreadNotifications;
  }
  if (variant === "rental_company") {
    const companyId = profile.company_id?.trim();
    const [life, unreadNotifications] = await Promise.all([
      getRentalSessionLifecycleCached(user.id, user.email),
      getUnreadNotificationCountCached(user.id),
    ]);

    const personal =
      profile.display_name?.trim() || user.email?.split("@")[0]?.trim() || "User";
    accountDisplayName =
      life.kind === "rental" && life.companyName ? `${personal} · ${life.companyName}` : personal;

    rentalUnreadNotifications = unreadNotifications;

    if (life.kind === "rental") {
      fleetTrackingEnabled = life.fleetTrackingEnabled;
      const companyName = life.companyName?.trim() || "";
      if (companyName) {
        rentalCompanyHeader = {
          name: companyName,
          address: formatRegisteredCompanyAddress({
            registered_address_line1: life.registeredAddressLine1,
            registered_address_line2: life.registeredAddressLine2,
            registered_town: life.registeredTown,
            registered_county: life.registeredCounty,
            registered_postcode: life.registeredPostcode,
          }),
        };
      }

      if (life.renewalSignaturePending && companyId) {
        try {
          const pending = await getPendingContractRenewalCached(companyId);
          rentalRenewalBanner = {
            signReady: pending?.signReady ?? false,
            signBlockedReason: pending?.signBlockedReason ?? null,
          };
        } catch {
          rentalRenewalBanner = { signReady: false, signBlockedReason: null };
        }
      }
    }
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
      driverCurrentHireGroupId={variant === "driver" ? driverCurrentHireGroupId : null}
      driverUnreadNotifications={variant === "driver" ? driverUnreadNotifications : 0}
      fleetTrackingEnabled={fleetTrackingEnabled}
      rentalUnreadNotifications={variant === "rental_company" ? rentalUnreadNotifications : 0}
      rentalRenewalBanner={variant === "rental_company" ? rentalRenewalBanner : null}
      rentalCompanyHeader={variant === "rental_company" ? rentalCompanyHeader : null}
    >
      {children}
    </Option7Shell>
  );
}
