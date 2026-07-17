import { unstable_cache, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CachedProfileRow = {
  id: string;
  role: string;
  display_name: string | null;
  company_id: string | null;
  company_role: string | null;
};

export type CachedMembershipRow = {
  parent_company_id: string;
  role: string;
  subcompany_scope: string | null;
};

export type ProfileBundle = {
  row: CachedProfileRow | null;
  memberships: CachedMembershipRow[];
};

function profileBundleTag(userId: string) {
  return `profile-bundle:${userId}`;
}

/**
 * Cross-request cache for the signed-in user's profile + active memberships.
 * Avoids repeating the same two DB round-trips on every tab click.
 */
export function getCachedProfileBundle(userId: string): Promise<ProfileBundle> {
  const id = userId.trim();
  const cached = unstable_cache(
    async (): Promise<ProfileBundle> => {
      const admin = createSupabaseAdminClient();
      const [{ data: row }, { data: memberships }] = await Promise.all([
        admin
          .from("profiles")
          .select("id, role, display_name, company_id, company_role")
          .eq("id", id)
          .maybeSingle(),
        admin
          .from("user_company_memberships")
          .select("parent_company_id, role, subcompany_scope")
          .eq("user_id", id)
          .eq("status", "active"),
      ]);

      return {
        row: (row as CachedProfileRow | null) ?? null,
        memberships: (memberships as CachedMembershipRow[] | null) ?? [],
      };
    },
    ["profile-bundle", id],
    { revalidate: 45, tags: [profileBundleTag(id)] },
  );
  return cached();
}

export function revalidateProfileBundle(userId: string | null | undefined) {
  const id = userId?.trim();
  if (!id) return;
  revalidateTag(profileBundleTag(id), { expire: 0 });
}
