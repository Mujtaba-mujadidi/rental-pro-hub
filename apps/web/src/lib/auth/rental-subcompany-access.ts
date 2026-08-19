import type { AppProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { userHasAllSubcompanyScope } from "@/lib/fleet/vehicle-historic-access";

export type UserAccessibleSubcompanies = "all" | string[];

/** Explicit-scope staff may only access hires whose subcompany is in their grant list. */
export function staffCanAccessHireSubcompany(
  accessible: UserAccessibleSubcompanies,
  hireSubcompanyId: string | null | undefined,
): boolean {
  if (accessible === "all") return true;
  const id = hireSubcompanyId?.trim() ?? "";
  if (!id) return false;
  return accessible.includes(id);
}

export async function assertStaffHireSubcompanyAccess(
  profile: AppProfile,
  hireSubcompanyId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accessible = await loadUserAccessibleSubcompanyIds(profile);
  if (!staffCanAccessHireSubcompany(accessible, hireSubcompanyId)) {
    return { ok: false, error: "Hire not found." };
  }
  return { ok: true };
}

export async function loadUserAccessibleSubcompanyIds(
  profile: AppProfile,
): Promise<UserAccessibleSubcompanies> {
  if (userHasAllSubcompanyScope(profile.subcompany_scope)) return "all";

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId || !profile.id) return [];

  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("user_company_memberships")
    .select("id")
    .eq("user_id", profile.id)
    .eq("parent_company_id", parentCompanyId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership?.id) return [];

  const { data: permissions, error: permissionsError } = await supabase
    .from("user_subcompany_permissions")
    .select("subcompany_id")
    .eq("membership_id", membership.id);

  if (permissionsError) return [];

  return [...new Set((permissions ?? []).map((row) => row.subcompany_id as string).filter(Boolean))];
}
