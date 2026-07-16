import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/auth/roles";

export type RentalSessionLifecycle =
  | { kind: "not_rental" }
  | {
      kind: "rental";
      companyId: string;
      deletionPhase: string;
      /** True when parent `company_contracts.status` is `active` (signed / legacy bootstrap). */
      contractActive: boolean;
      onboardingComplete: boolean;
    };

/**
 * Resolves the active parent company and lifecycle fields for a session (RLS-safe).
 * Used by middleware and home-path resolution.
 */
export async function getRentalSessionLifecycle(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<RentalSessionLifecycle> {
  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", userId).maybeSingle();

  if (isSuperAdminEmail(email) || profile?.role === "super_admin") {
    return { kind: "not_rental" };
  }
  if (profile?.role !== "rental_company") {
    return { kind: "not_rental" };
  }

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

  if (!activeParent) {
    return { kind: "not_rental" };
  }

  const { data: co } = await supabase
    .from("companies")
    .select("deletion_phase, rental_onboarding_completed_at")
    .eq("id", activeParent)
    .maybeSingle();

  const deletionPhase = (co?.deletion_phase as string) ?? "active";

  const { data: cc, error: ccErr } = await supabase
    .from("company_contracts")
    .select("status")
    .eq("parent_company_id", activeParent)
    .maybeSingle();

  const contractActive = !ccErr && (cc?.status as string | undefined) === "active";

  return {
    kind: "rental",
    companyId: activeParent,
    deletionPhase,
    contractActive,
    onboardingComplete: !!co?.rental_onboarding_completed_at,
  };
}

/**
 * Enforce rental-area URL policy. Returns a pathname to redirect to, or null if the current path is allowed.
 */
export function rentalPathRequiresRedirect(pathname: string, ctx: RentalSessionLifecycle): string | null {
  if (ctx.kind !== "rental") return null;

  const phase = ctx.deletionPhase;

  if (phase === "access_blocked") {
    if (pathname === "/rental/account-closed" || pathname.startsWith("/rental/account-closed/")) return null;
    return "/rental/account-closed";
  }

  if (phase === "offboarding") {
    if (pathname === "/rental/offboarding" || pathname.startsWith("/rental/offboarding/")) return null;
    return "/rental/offboarding";
  }

  if (!ctx.contractActive) {
    if (pathname === "/rental/awaiting-contract" || pathname.startsWith("/rental/awaiting-contract/")) return null;
    return "/rental/awaiting-contract";
  }

  if (pathname === "/rental/awaiting-contract" || pathname.startsWith("/rental/awaiting-contract/")) {
    if (!ctx.onboardingComplete) return "/rental/onboarding";
    return "/rental";
  }

  if (!ctx.onboardingComplete) {
    if (pathname === "/rental/onboarding" || pathname.startsWith("/rental/onboarding/")) return null;
    if (pathname.startsWith("/rental")) return "/rental/onboarding";
  }

  return null;
}
