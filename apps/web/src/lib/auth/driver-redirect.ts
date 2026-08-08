import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedProfileBundle } from "@/lib/auth/profile-bundle-cache";
import { loadRentalSessionLifecycleFromCompany } from "@/lib/auth/rental-lifecycle";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
  type DriverOnboardingRow,
} from "@/lib/driver/licence-check";

export type AppHomePath =
  | "/super-admin"
  | "/driver"
  | "/driver/onboarding"
  | "/rental"
  | "/rental/awaiting-contract"
  | "/rental/onboarding"
  | "/rental/offboarding"
  | "/rental/account-closed";

/** @deprecated Use resolveAppHomePath */
export type DriverHomePath = AppHomePath;

export async function resolveAppHomePath(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<AppHomePath> {
  if (isSuperAdminEmail(email)) {
    return "/super-admin";
  }

  const bundle = await getCachedProfileBundle(userId);
  const profile = bundle.row;

  if (profile?.role === "super_admin") {
    return "/super-admin";
  }

  if (profile?.role === "rental_company") {
    const preferred = profile.company_id?.trim() ?? null;
    const activeParent =
      preferred && bundle.memberships.some((m) => m.parent_company_id === preferred)
        ? preferred
        : (bundle.memberships[0]?.parent_company_id ?? null);

    if (!activeParent) {
      return "/rental";
    }

    const life = await loadRentalSessionLifecycleFromCompany(activeParent);
    if (life.kind !== "rental") {
      return "/rental";
    }
    if (life.deletionPhase === "access_blocked") {
      return "/rental/account-closed";
    }
    if (life.deletionPhase === "offboarding") {
      return "/rental/offboarding";
    }
    if (!life.contractActive) {
      return "/rental/awaiting-contract";
    }
    if (!life.onboardingComplete) {
      return "/rental/onboarding";
    }
    return "/rental";
  }

  const { data } = await supabase
    .from("driver_profiles")
    .select(DRIVER_ONBOARDING_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (driverOnboardingComplete(data as DriverOnboardingRow)) {
    return "/driver";
  }
  return "/driver/onboarding";
}

/** @deprecated Use resolveAppHomePath */
export async function resolveDriverHomePath(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<AppHomePath> {
  return resolveAppHomePath(supabase, userId, email);
}
