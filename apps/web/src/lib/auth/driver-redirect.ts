import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
  type DriverOnboardingRow,
} from "@/lib/driver/licence-check";

export type AppHomePath = "/super-admin" | "/driver" | "/driver/onboarding" | "/rental" | "/rental/onboarding";

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
    const { data: memberships } = await supabase
      .from("user_company_memberships")
      .select("parent_company_id")
      .eq("user_id", userId)
      .eq("status", "active");

    const rows = memberships ?? [];
    const preferred = profile.company_id?.trim() ?? null;
    const activeParent =
      preferred && rows.some((m) => m.parent_company_id === preferred)
        ? preferred
        : rows[0]?.parent_company_id ?? preferred;

    if (activeParent) {
      const { data: co } = await supabase
        .from("companies")
        .select("rental_onboarding_completed_at")
        .eq("id", activeParent)
        .maybeSingle();
      if (!co?.rental_onboarding_completed_at) {
        return "/rental/onboarding";
      }
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
