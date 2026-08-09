import type { AppProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { userHasAllSubcompanyScope } from "@/lib/fleet/vehicle-historic-access";

export type UserAccessibleSubcompanies = "all" | string[];

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
