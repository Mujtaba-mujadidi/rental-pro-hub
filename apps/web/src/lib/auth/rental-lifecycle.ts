import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getRentalCompanyGateCached } from "@/lib/auth/company-gate-cache";
import { getAppProfile } from "@/lib/auth/profile";
import { resolveRentalContractAccess } from "@/lib/auth/rental-contract-access";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
      /** Legal detail amendment approved; renewal signature still outstanding. */
      renewalSignaturePending: boolean;
      fleetTrackingEnabled: boolean;
      registeredAddressLine1: string | null;
      registeredAddressLine2: string | null;
      registeredTown: string | null;
      registeredCounty: string | null;
      registeredPostcode: string | null;
    };

/** Fresh contract gate (no cross-request cache) — used for redirects so stale cache cannot flash awaiting-contract. */
export const loadRentalContractAccessFresh = cache(async (companyId: string) => {
  const id = companyId.trim();
  const admin = createSupabaseAdminClient();
  const [{ data: co }, { data: cc, error: ccErr }, { data: pendingAmendment }] = await Promise.all([
    admin
      .from("companies")
      .select("rental_onboarding_completed_at, contract_status")
      .eq("id", id)
      .maybeSingle(),
    admin.from("company_contracts").select("status").eq("parent_company_id", id).maybeSingle(),
    admin
      .from("company_contract_change_requests")
      .select("id")
      .eq("parent_company_id", id)
      .eq("status", "pending_signature")
      .in("review_status", ["awaiting_signature", "approved"])
      .limit(1)
      .maybeSingle(),
  ]);
  const onboardingComplete = !!co?.rental_onboarding_completed_at;
  const access = resolveRentalContractAccess({
    contractStatus: ccErr ? null : ((cc?.status as string | undefined) ?? null),
    companyContractStatus: (co?.contract_status as string | undefined) ?? null,
    onboardingComplete,
    hasPendingAmendmentSignature: Boolean(pendingAmendment?.id),
  });
  return {
    onboardingComplete,
    contractActive: access.contractActive,
    renewalSignaturePending: access.renewalSignaturePending,
  };
});

function mergeFreshContractAccess(
  life: Extract<RentalSessionLifecycle, { kind: "rental" }>,
  fresh: Awaited<ReturnType<typeof loadRentalContractAccessFresh>>,
): Extract<RentalSessionLifecycle, { kind: "rental" }> {
  return {
    ...life,
    contractActive: fresh.contractActive,
    renewalSignaturePending: fresh.renewalSignaturePending,
    onboardingComplete: fresh.onboardingComplete,
  };
}

async function loadRentalSessionLifecycleFromCompany(
  companyId: string,
): Promise<RentalSessionLifecycle> {
  try {
    const gate = await getRentalCompanyGateCached(companyId);
    return {
      kind: "rental",
      companyId,
      companyName: gate.companyName,
      deletionPhase: gate.deletionPhase,
      contractActive: gate.contractActive,
      onboardingComplete: gate.onboardingComplete,
      renewalSignaturePending: gate.renewalSignaturePending,
      fleetTrackingEnabled: gate.fleetTrackingEnabled,
      registeredAddressLine1: gate.registeredAddressLine1,
      registeredAddressLine2: gate.registeredAddressLine2,
      registeredTown: gate.registeredTown,
      registeredCounty: gate.registeredCounty,
      registeredPostcode: gate.registeredPostcode,
    };
  } catch {
    // Service role / cache unavailable — fall back to user-scoped client.
    const supabase = await createClient();
    const [{ data: co }, { data: cc, error: ccErr }, { data: pendingAmendment }] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "name, deletion_phase, rental_onboarding_completed_at, contract_status, fleet_tracking_enabled, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode",
        )
        .eq("id", companyId)
        .maybeSingle(),
      supabase.from("company_contracts").select("status").eq("parent_company_id", companyId).maybeSingle(),
      supabase
        .from("company_contract_change_requests")
        .select("id")
        .eq("parent_company_id", companyId)
        .eq("status", "pending_signature")
        .in("review_status", ["awaiting_signature", "approved"])
        .limit(1)
        .maybeSingle(),
    ]);
    const onboardingComplete = !!co?.rental_onboarding_completed_at;
    const access = resolveRentalContractAccess({
      contractStatus: ccErr ? null : ((cc?.status as string | undefined) ?? null),
      companyContractStatus: (co?.contract_status as string | undefined) ?? null,
      onboardingComplete,
      hasPendingAmendmentSignature: Boolean(pendingAmendment?.id),
    });
    return {
      kind: "rental",
      companyId,
      companyName: (co?.name as string | null | undefined)?.trim() || null,
      deletionPhase: (co?.deletion_phase as string) ?? "active",
      contractActive: access.contractActive,
      onboardingComplete,
      renewalSignaturePending: access.renewalSignaturePending,
      fleetTrackingEnabled: Boolean(co?.fleet_tracking_enabled),
      registeredAddressLine1: (co?.registered_address_line1 as string | null) ?? null,
      registeredAddressLine2: (co?.registered_address_line2 as string | null) ?? null,
      registeredTown: (co?.registered_town as string | null) ?? null,
      registeredCounty: (co?.registered_county as string | null) ?? null,
      registeredPostcode: (co?.registered_postcode as string | null) ?? null,
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
      : (rows[0]?.parent_company_id ?? null);

  if (!activeParent) {
    return { kind: "not_rental" };
  }

  const life = await loadRentalSessionLifecycleFromCompany(activeParent);
  if (life.kind !== "rental") return life;
  const fresh = await loadRentalContractAccessFresh(activeParent);
  return mergeFreshContractAccess(life, fresh);
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

  const life = await loadRentalSessionLifecycleFromCompany(profile.company_id);
  if (life.kind !== "rental") return life;
  const fresh = await loadRentalContractAccessFresh(profile.company_id);
  return mergeFreshContractAccess(life, fresh);
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

  const onAwaitingContract =
    pathname === "/rental/awaiting-contract" || pathname.startsWith("/rental/awaiting-contract/");
  if (onAwaitingContract) {
    if (!ctx.onboardingComplete) return "/rental/onboarding";
    return "/rental";
  }

  if (!ctx.onboardingComplete) {
    if (pathname === "/rental/onboarding" || pathname.startsWith("/rental/onboarding/")) return null;
    if (pathname.startsWith("/rental")) return "/rental/onboarding";
  }

  return null;
}
