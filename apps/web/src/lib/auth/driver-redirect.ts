import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
  type DriverOnboardingRow,
} from "@/lib/driver/licence-check";

export type AppHomePath = "/super-admin" | "/driver" | "/driver/onboarding" | "/rental";

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

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();

  if (profile?.role === "rental_company") {
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
