import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveHireLessorDisplayName,
  type HireLessorNameSource,
} from "@/lib/rental/subcompany-legal-snapshot";

export type { HireLessorNameSource };
export { resolveHireLessorDisplayName };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Load the lessor name shown to drivers (emails, signing, workspace) for a hire group. */
export async function loadHireLessorDisplayName(admin: Admin, hireGroupId: string): Promise<string> {
  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select(
      "subcompany_id, subcompany_legal_snapshot, parent_company_id, companies(name), subcompanies(legal_name, display_name, name)",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();

  if (!group) return "Rental company";

  const sub = group.subcompanies as HireLessorNameSource | null;
  const snap = (group.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null;
  const parentName = (group.companies as { name?: string } | null)?.name ?? null;
  const hasSubcompany = Boolean(group.subcompany_id);

  return resolveHireLessorDisplayName({
    snapshot: snap,
    subcompany: sub,
    parentCompanyName: parentName,
    hasSubcompany,
  });
}
