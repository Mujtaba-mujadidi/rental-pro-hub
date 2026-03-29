import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
  type DriverOnboardingRow,
} from "@/lib/driver/licence-check";

export type DriverHomePath = "/super-admin" | "/driver" | "/driver/onboarding";

export async function resolveDriverHomePath(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<DriverHomePath> {
  if (isSuperAdminEmail(email)) {
    return "/super-admin";
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
