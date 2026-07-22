import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirectIfRentalContractNotActive } from "@/lib/auth/rental-contract-gate";
import {
  getCachedProfileBundle,
  type CachedMembershipRow,
} from "@/lib/auth/profile-bundle-cache";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/auth/roles";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_SELECT_FULL = "id, role, display_name, company_id, company_role" as const;
const PROFILE_SELECT_MIN = "id, role, display_name" as const;

type ProfileRow = {
  id: string;
  role: string;
  display_name: string | null;
  company_id: string | null;
  company_role: string | null;
};

function isMissingCompanyColumnsError(message: string): boolean {
  return /\bcompany_id\b.*does not exist|does not exist.*\bcompany_id\b/i.test(message);
}

function isRlsViolation(message: string): boolean {
  return /\brow-level security\b|violates row-level security policy/i.test(message);
}

/** Trigger or concurrent request may have inserted the row first (e.g. handle_new_user). */
function isDuplicateProfileKeyError(message: string): boolean {
  return /duplicate key|unique constraint.*profiles_pkey|23505/i.test(message);
}

/** Load profile; fall back if DB predates `profiles.company_id` / `company_role` migrations. */
async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: ProfileRow | null; error: Error | null }> {
  const full = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FULL)
    .eq("id", userId)
    .maybeSingle();

  if (!full.error && full.data) {
    return { data: full.data as ProfileRow, error: null };
  }

  const errMsg = full.error && "message" in full.error ? String(full.error.message) : "";
  if (full.error && isMissingCompanyColumnsError(errMsg)) {
    console.warn(
      "[auth] profiles.company_id / company_role missing on database; using legacy select. Run migrations or supabase/manual/ensure_profiles_company_columns.sql",
    );
    const min = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_MIN)
      .eq("id", userId)
      .maybeSingle();
    if (min.error) {
      return { data: null, error: new Error(min.error.message) };
    }
    if (!min.data) {
      return { data: null, error: null };
    }
    const r = min.data as { id: string; role: string; display_name: string | null };
    return {
      data: { ...r, company_id: null, company_role: null },
      error: null,
    };
  }

  return {
    data: null,
    error: full.error ? new Error(errMsg || "profiles load failed") : null,
  };
}

export type CompanyMembershipRole = "owner" | "admin" | "operations" | "finance" | "viewer";

export type AppProfile = {
  id: string;
  role: "driver" | "super_admin" | "rental_company";
  display_name: string | null;
  /** Active parent company (from membership, aligned with profiles.company_id when possible). */
  company_id: string | null;
  company_role: "admin" | "staff" | null;
  membership_role: CompanyMembershipRole | null;
  subcompany_scope: "all" | "explicit" | null;
};

export const getSessionUser = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user?.id) return user;

  // Prefer JWT claims (local/JWKS verify) when Auth server is unreachable.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | {
        sub?: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
        phone?: string;
      }
    | undefined;

  if (claims?.sub) {
    return {
      id: claims.sub,
      email: claims.email,
      phone: claims.phone,
      user_metadata: claims.user_metadata ?? {},
      app_metadata: claims.app_metadata ?? {},
      aud: "authenticated",
      created_at: "",
      // Minimal User shape for profile helpers; sensitive actions still call getUser when needed.
    } as User;
  }

  return null;
});

/** Insert a missing profiles row (RLS: own id only). Super admin role if SUPER_ADMIN_EMAIL matches. */
async function ensureProfileRow(user: User): Promise<boolean> {
  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (exErr) {
    console.error("profiles check failed", exErr.message);
    return false;
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.first_name === "string" && typeof meta?.last_name === "string"
        ? `${meta.first_name} ${meta.last_name}`.trim()
        : null;
  const displayName = fromMeta?.trim() || user.email?.split("@")[0] || "User";
  const appRole = typeof meta?.app_role === "string" ? meta.app_role.toLowerCase() : "";
  const companyRoleMetaRaw = typeof meta?.company_role === "string" ? meta.company_role.toLowerCase() : "";
  const companyRoleMeta: AppProfile["company_role"] =
    companyRoleMetaRaw === "staff" ? "staff" : companyRoleMetaRaw === "admin" ? "admin" : "admin";
  const companyIdMeta = typeof meta?.company_id === "string" ? meta.company_id.trim() : "";
  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyIdMeta);

  const role: AppProfile["role"] = isSuperAdminEmail(user.email)
    ? "super_admin"
    : appRole === "rental_company" && uuidOk
      ? "rental_company"
      : "driver";

  // Profile already exists: upgrade accidental driver → rental when invite metadata is present.
  // Never return false here — that locks the user out of the app (login → home → /login loop).
  if (existing) {
    if (
      role === "rental_company" &&
      (existing.role !== "rental_company" || existing.company_id !== companyIdMeta)
    ) {
      try {
        const admin = createSupabaseAdminClient();
        const { data: companyRow } = await admin
          .from("companies")
          .select("id")
          .eq("id", companyIdMeta)
          .maybeSingle();

        if (!companyRow) {
          console.error(
            "profiles rental upgrade skipped: company_id missing from companies",
            companyIdMeta,
          );
          // Stale invite metadata (e.g. company deleted/re-registered) — clear so we stop retrying.
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              app_role: null,
              company_id: null,
              company_role: null,
            },
          });
          return true;
        }

        const { error: upErr } = await admin
          .from("profiles")
          .update({
            role: "rental_company",
            company_id: companyIdMeta,
            company_role: companyRoleMeta,
            display_name: displayName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        if (upErr) {
          console.error("profiles rental upgrade failed", upErr.message);
          return true;
        }
        await admin.from("user_company_memberships").upsert(
          {
            user_id: user.id,
            parent_company_id: companyIdMeta,
            role: "owner",
            subcompany_scope: "all",
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,parent_company_id" },
        );
        await admin.from("driver_profiles").delete().eq("user_id", user.id);
      } catch (e) {
        console.error("profiles rental upgrade unavailable", e);
        return true;
      }
    }
    return true;
  }

  let insertRole: AppProfile["role"] = role;
  let withTenant =
    insertRole === "rental_company" ? { company_id: companyIdMeta, company_role: companyRoleMeta } : {};

  if (insertRole === "rental_company") {
    try {
      const admin = createSupabaseAdminClient();
      const { data: companyRow } = await admin
        .from("companies")
        .select("id")
        .eq("id", companyIdMeta)
        .maybeSingle();
      if (!companyRow) {
        console.error(
          "profiles insert: rental company_id missing; creating driver profile instead",
          companyIdMeta,
        );
        await admin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            app_role: null,
            company_id: null,
            company_role: null,
          },
        });
        insertRole = "driver";
        withTenant = {};
      }
    } catch (e) {
      console.error("profiles insert: could not verify company_id", e);
      insertRole = "driver";
      withTenant = {};
    }
  }

  const basePayload = { id: user.id, display_name: displayName, role: insertRole };
  const fullPayload = { ...basePayload, ...withTenant };

  /** Idempotent: auth trigger may already have inserted this row; races also cause duplicate PK. */
  async function tryProfileEnsure(client: SupabaseClient): Promise<string | null> {
    let { error } = await client.from("profiles").upsert(fullPayload, {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    if (error && insertRole === "rental_company" && isMissingCompanyColumnsError(error.message)) {
      ({ error } = await client.from("profiles").upsert(basePayload, {
        onConflict: "id",
        ignoreDuplicates: true,
      }));
    }
    return error?.message ?? null;
  }

  let failMsg = await tryProfileEnsure(supabase);

  if (failMsg && isDuplicateProfileKeyError(failMsg)) {
    return true;
  }

  if (failMsg && isRlsViolation(failMsg)) {
    try {
      const admin = createSupabaseAdminClient();
      failMsg = await tryProfileEnsure(admin);
      if (!failMsg) {
        console.warn(
          "[auth] profiles row created with service role (user INSERT blocked by RLS). Add policy profiles_insert_own — see supabase/manual/profiles_insert_own_policy.sql",
        );
        return true;
      }
      if (isDuplicateProfileKeyError(failMsg)) {
        return true;
      }
    } catch {
      /* SUPABASE_SERVICE_ROLE_KEY missing */
    }
  }

  if (failMsg) {
    console.error("profiles insert failed", failMsg);
    return false;
  }
  return true;
}

function profileNeedsRentalUpgrade(
  user: User,
  existing: { role: string; company_id: string | null },
): boolean {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const appRole = typeof meta?.app_role === "string" ? meta.app_role.toLowerCase() : "";
  const companyIdMeta = typeof meta?.company_id === "string" ? meta.company_id.trim() : "";
  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    companyIdMeta,
  );
  if (isSuperAdminEmail(user.email)) return false;
  if (!(appRole === "rental_company" && uuidOk)) return false;
  return existing.role !== "rental_company" || existing.company_id !== companyIdMeta;
}

export const getAppProfile = cache(async (): Promise<AppProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  let row: ProfileRow | null = null;
  let memberships: CachedMembershipRow[] | null = null;

  try {
    const bundle = await getCachedProfileBundle(user.id);
    row = bundle.row;
    memberships = bundle.memberships;
  } catch {
    const supabase = await createClient();
    const first = await fetchProfileRow(supabase, user.id);
    if (first.error) {
      console.error("profiles load failed", first.error.message);
      return null;
    }
    row = first.data;
  }

  const needsEnsure = !row || profileNeedsRentalUpgrade(user, row);
  if (needsEnsure) {
    const ensured = await ensureProfileRow(user);
    if (!ensured) return null;
    // Do not revalidateTag here — getAppProfile runs during RSC render.
    // Fresh row is loaded below; cache TTL (45s) covers the next request.
    const supabase = await createClient();
    const second = await fetchProfileRow(supabase, user.id);
    if (second.error) {
      console.error("profiles load failed", second.error.message);
      return null;
    }
    row = second.data;
    memberships = null;
  }

  if (!row) return null;
  if (memberships) {
    return resolveRentalMemberships(null, user.id, user.email, row, memberships);
  }
  const supabase = await createClient();
  return resolveRentalMemberships(supabase, user.id, user.email, row, null);
});

/** Route handlers should use this instead of cached `getAppProfile()`. */
export async function loadAppProfileFromRequest(): Promise<AppProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const first = await fetchProfileRow(supabase, user.id);
  if (first.error || !first.data) return null;
  return resolveRentalMemberships(supabase, user.id, user.email, first.data, null);
}

function normalizeAppProfileRow(row: {
  id: string;
  role: string;
  display_name: string | null;
  company_id: string | null;
  company_role: string | null;
}): AppProfile {
  let role: AppProfile["role"] = "driver";
  if (row.role === "super_admin") role = "super_admin";
  else if (row.role === "rental_company") role = "rental_company";

  return {
    id: row.id,
    role,
    display_name: row.display_name,
    company_id: row.company_id ?? null,
    company_role:
      row.company_role === "admin" || row.company_role === "staff" ? row.company_role : role === "rental_company" ? "admin" : null,
    membership_role: null,
    subcompany_scope: null,
  };
}

async function resolveRentalMemberships(
  supabase: Awaited<ReturnType<typeof createClient>> | null,
  userId: string,
  email: string | undefined,
  row: {
    id: string;
    role: string;
    display_name: string | null;
    company_id: string | null;
    company_role: string | null;
  },
  cachedMemberships?: CachedMembershipRow[] | null,
): Promise<AppProfile> {
  const base = normalizeAppProfileRow(row);

  // Super admin is never merged with rental memberships (avoids wrong tenant if DB/metadata is inconsistent).
  if (isSuperAdminEmail(email) || base.role === "super_admin") {
    return {
      id: row.id,
      role: "super_admin",
      display_name: row.display_name,
      company_id: null,
      company_role: null,
      membership_role: null,
      subcompany_scope: null,
    };
  }

  if (base.role !== "rental_company") return base;

  let list: CachedMembershipRow[] = cachedMemberships ?? [];
  if (!cachedMemberships) {
    if (!supabase) return base;
    const { data: memberships, error: mErr } = await supabase
      .from("user_company_memberships")
      .select("parent_company_id, role, subcompany_scope")
      .eq("user_id", userId)
      .eq("status", "active");

    if (mErr) {
      console.error("user_company_memberships load failed", mErr.message);
      return base;
    }
    list = (memberships as CachedMembershipRow[] | null) ?? [];
  }

  if (list.length === 0) {
    return base;
  }

  const preferred = row.company_id?.trim() ?? null;
  const pick =
    preferred && list.some((m) => m.parent_company_id === preferred)
      ? list.find((m) => m.parent_company_id === preferred)!
      : list[0]!;

  const mr = pick.role as string;
  const membershipRole: CompanyMembershipRole | null =
    mr === "owner" || mr === "admin" || mr === "operations" || mr === "finance" || mr === "viewer" ? mr : null;

  const scopeRaw = pick.subcompany_scope as string;
  const subcompanyScope: "all" | "explicit" | null =
    scopeRaw === "all" || scopeRaw === "explicit" ? scopeRaw : null;

  return {
    ...base,
    company_id: pick.parent_company_id,
    membership_role: membershipRole,
    subcompany_scope: subcompanyScope,
    company_role: membershipRole === "owner" || membershipRole === "admin" ? "admin" : "staff",
  };
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAuthProfile() {
  const user = await requireAuth();
  const profile = await getAppProfile();
  if (!profile) redirect("/login");
  return { user, profile };
}

export async function requireSuperAdmin() {
  const { user, profile } = await requireAuthProfile();
  if (!isSuperAdmin(user.email, profile)) {
    if (profile.role === "rental_company") redirect("/rental");
    redirect("/driver");
  }
  return { user, profile };
}

export async function requireDriverArea() {
  const { user, profile } = await requireAuthProfile();
  if (isSuperAdmin(user.email, profile)) {
    redirect("/super-admin");
  }
  if (profile.role === "rental_company") {
    redirect("/rental");
  }
  return { user, profile };
}

/**
 * Rental tenant area. By default requires an active parent contract (signed / legacy bootstrap).
 * Set `skipActiveContractRequirement` for `/rental/awaiting-contract`, offboarding, and account-closed pages.
 */
export async function requireRentalCompanyArea(options?: { skipActiveContractRequirement?: boolean }) {
  const { user, profile } = await requireAuthProfile();
  if (isSuperAdmin(user.email, profile)) {
    redirect("/super-admin");
  }
  if (profile.role !== "rental_company") {
    redirect("/driver");
  }
  if (!options?.skipActiveContractRequirement) {
    await redirectIfRentalContractNotActive(profile.company_id);
  }
  return { user, profile };
}
