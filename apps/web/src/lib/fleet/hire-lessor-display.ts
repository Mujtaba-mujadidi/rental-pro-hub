import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveHireLessorDisplayName,
  resolveHireLessorMailIdentity,
  type HireLessorMailIdentity,
  type HireLessorNameSource,
} from "@/lib/rental/subcompany-legal-snapshot";

export type { HireLessorMailIdentity, HireLessorNameSource };
export { resolveHireLessorDisplayName, resolveHireLessorMailIdentity };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const SUBCOMPANY_IDENTITY_SELECT =
  "legal_name, display_name, name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode";

/** Load the lessor name shown to drivers (emails, signing, workspace) for a hire group. */
export async function loadHireLessorDisplayName(admin: Admin, hireGroupId: string): Promise<string> {
  const identity = await loadHireLessorMailIdentity(admin, hireGroupId);
  return identity.displayName;
}

/** Full subcompany lessor identity for driver-facing emails (legal name, number, address). */
export async function loadHireLessorMailIdentity(
  admin: Admin,
  hireGroupId: string,
): Promise<HireLessorMailIdentity> {
  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("subcompany_id, subcompany_legal_snapshot, parent_company_id, companies(name)")
    .eq("id", hireGroupId.trim())
    .maybeSingle();

  if (!group) {
    return { displayName: "Rental company", legalName: null, companyNumber: null, address: null };
  }

  let subcompany: HireLessorNameSource & Record<string, string | null> | null = null;
  if (group.subcompany_id) {
    const { data: sub } = await admin
      .from("subcompanies")
      .select(SUBCOMPANY_IDENTITY_SELECT)
      .eq("id", group.subcompany_id)
      .maybeSingle();
    subcompany = sub;
  }

  const snap = (group.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null;
  const parentName = (group.companies as { name?: string } | null)?.name ?? null;

  return resolveHireLessorMailIdentity({
    snapshot: snap,
    subcompany,
    parentCompanyName: parentName,
    hasSubcompany: Boolean(group.subcompany_id),
  });
}
