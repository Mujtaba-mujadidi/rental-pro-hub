import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import { getRentalSessionLifecycle } from "@/lib/auth/rental-lifecycle";
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
  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", userId).maybeSingle();

  // Env-based super admin OR profile row (so login works even if SUPER_ADMIN_EMAIL is unset/mismatched).
  if (isSuperAdminEmail(email) || profile?.role === "super_admin") {
    return "/super-admin";
  }

  if (profile?.role === "rental_company") {
    const life = await getRentalSessionLifecycle(supabase, userId, email);
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
