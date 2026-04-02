import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/auth/roles";

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

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

/** Insert a missing profiles row (RLS: own id only). Super admin role if SUPER_ADMIN_EMAIL matches. */
async function ensureProfileRow(user: User): Promise<boolean> {
  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (exErr) {
    console.error("profiles check failed", exErr.message);
    return false;
  }
  if (existing) return true;

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

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
    role,
    ...(role === "rental_company" ? { company_id: companyIdMeta, company_role: companyRoleMeta } : {}),
  });

  if (error) {
    console.error("profiles insert failed", error.message);
    return false;
  }
  return true;
}

export async function getAppProfile(): Promise<AppProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, company_id, company_role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("profiles load failed", error.message);
    return null;
  }

  if (!data) {
    const created = await ensureProfileRow(user);
    if (!created) return null;
    const { data: again, error: err2 } = await supabase
      .from("profiles")
      .select("id, role, display_name, company_id, company_role")
      .eq("id", user.id)
      .maybeSingle();
    if (err2 || !again) return null;
    return resolveRentalMemberships(supabase, user.id, user.email, again);
  }

  return resolveRentalMemberships(supabase, user.id, user.email, data);
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string | undefined,
  row: {
    id: string;
    role: string;
    display_name: string | null;
    company_id: string | null;
    company_role: string | null;
  },
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

  const { data: memberships, error: mErr } = await supabase
    .from("user_company_memberships")
    .select("parent_company_id, role, subcompany_scope")
    .eq("user_id", userId)
    .eq("status", "active");

  if (mErr) {
    console.error("user_company_memberships load failed", mErr.message);
    return base;
  }

  const list = memberships ?? [];
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

export async function requireRentalCompanyArea() {
  const { user, profile } = await requireAuthProfile();
  if (isSuperAdmin(user.email, profile)) {
    redirect("/super-admin");
  }
  if (profile.role !== "rental_company") {
    redirect("/driver");
  }
  return { user, profile };
}
