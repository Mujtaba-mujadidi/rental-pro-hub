import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getCachedCompanyGate } from "@/lib/auth/company-gate-cache";
import { getAppProfile } from "@/lib/auth/profile";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type RentalSessionLifecycle =
  | { kind: "not_rental" }
  | {
      kind: "rental";
      companyId: string;
      companyName: string | null;
      deletionPhase: string;
      /** True when parent `company_contracts.status` is `active` (signed / legacy bootstrap). */
      contractActive: boolean;
      onboardingComplete: boolean;
    };

async function loadRentalSessionLifecycleFromCompany(
  companyId: string,
): Promise<RentalSessionLifecycle> {
  try {
    const gate = await getCachedCompanyGate(companyId);
    return {
      kind: "rental",
      companyId,
      companyName: gate.companyName,
      deletionPhase: gate.deletionPhase,
      contractActive: gate.contractActive,
      onboardingComplete: gate.onboardingComplete,
    };
  } catch {
    // Service role / cache unavailable — fall back to user-scoped client.
    const supabase = await createClient();
    const [{ data: co }, { data: cc, error: ccErr }] = await Promise.all([
      supabase
        .from("companies")
        .select("name, deletion_phase, rental_onboarding_completed_at")
        .eq("id", companyId)
        .maybeSingle(),
      supabase.from("company_contracts").select("status").eq("parent_company_id", companyId).maybeSingle(),
    ]);
    return {
      kind: "rental",
      companyId,
      companyName: (co?.name as string | null | undefined)?.trim() || null,
      deletionPhase: (co?.deletion_phase as string) ?? "active",
      contractActive: !ccErr && (cc?.status as string | undefined) === "active",
      onboardingComplete: !!co?.rental_onboarding_completed_at,
    };
  }
}

/**
 * Resolves lifecycle using a caller-provided client (login home redirect / API routes).
 * Does not depend on React `getAppProfile` cache.
 */
export async function getRentalSessionLifecycle(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<RentalSessionLifecycle> {
  if (isSuperAdminEmail(email)) {
    return { kind: "not_rental" };
  }

  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", userId).maybeSingle();
  if (profile?.role === "super_admin" || profile?.role !== "rental_company") {
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

  return loadRentalSessionLifecycleFromCompany(activeParent);
}

/**
 * One lifecycle load per RSC request. Reuses `getAppProfile` (no duplicate profiles/memberships)
 * and the cross-request company gate cache.
 */
export const getRentalSessionLifecycleCached = cache(async (userId: string, email: string | undefined) => {
  if (isSuperAdminEmail(email)) {
    return { kind: "not_rental" } as const;
  }

  const profile = await getAppProfile();
  if (!profile || profile.id !== userId || profile.role !== "rental_company" || !profile.company_id) {
    return { kind: "not_rental" } as const;
  }

  return loadRentalSessionLifecycleFromCompany(profile.company_id);
});

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
