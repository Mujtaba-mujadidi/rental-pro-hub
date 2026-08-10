import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveEffectiveHireLessorSubcompanyId,
  resolveHireLessorDisplayName,
  resolveHireLessorMailIdentity,
  shouldUseFrozenLessorSnapshot,
  type HireLessorMailIdentity,
  type HireLessorNameSource,
} from "@/lib/rental/subcompany-legal-snapshot";

export type { HireLessorMailIdentity, HireLessorNameSource };
export { resolveHireLessorDisplayName, resolveHireLessorMailIdentity };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const SUBCOMPANY_IDENTITY_SELECT =
  "legal_name, display_name, name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode";

async function loadSubcompanyIdentity(admin: Admin, subcompanyId: string) {
  const { data: sub } = await admin
    .from("subcompanies")
    .select(SUBCOMPANY_IDENTITY_SELECT)
    .eq("id", subcompanyId)
    .maybeSingle();
  return sub;
}

/** Live subcompany lessor identity — never uses a hire-group legal snapshot. */
export async function loadHireLessorMailIdentityForSubcompany(
  admin: Admin,
  subcompanyId: string,
  parentCompanyId?: string | null,
): Promise<HireLessorMailIdentity> {
  const subcompany = await loadSubcompanyIdentity(admin, subcompanyId);
  let parentCompanyName: string | null = null;
  if (parentCompanyId?.trim()) {
    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", parentCompanyId.trim())
      .maybeSingle();
    parentCompanyName = (company?.name as string | null) ?? null;
  }

  return resolveHireLessorMailIdentity({
    subcompany,
    parentCompanyName,
    hasSubcompany: true,
    useSnapshot: false,
  });
}

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
    .select(
      "subcompany_id, subcompany_legal_snapshot, parent_company_id, status, vehicle_id, companies(name), vehicles(subcompany_id)",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();

  if (!group) {
    return { displayName: "Rental company", legalName: null, companyNumber: null, address: null };
  }

  let vehicleSubcompanyId = (group.vehicles as { subcompany_id?: string } | null)?.subcompany_id ?? null;
  if (!vehicleSubcompanyId && group.vehicle_id) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("subcompany_id")
      .eq("id", group.vehicle_id as string)
      .maybeSingle();
    vehicleSubcompanyId = (vehicle?.subcompany_id as string | null) ?? null;
  }

  const effectiveSubcompanyId = resolveEffectiveHireLessorSubcompanyId({
    hireGroupSubcompanyId: group.subcompany_id as string | null,
    vehicleSubcompanyId,
  });

  let subcompany: HireLessorNameSource & Record<string, string | null> | null = null;
  if (effectiveSubcompanyId) {
    subcompany = await loadSubcompanyIdentity(admin, effectiveSubcompanyId);
  }

  const frozenSnapshot = (group.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null;
  const useSnapshot = shouldUseFrozenLessorSnapshot({
    hireStatus: group.status as string,
    snapshot: frozenSnapshot,
    subcompany,
  });
  const parentName = (group.companies as { name?: string } | null)?.name ?? null;

  return resolveHireLessorMailIdentity({
    snapshot: useSnapshot ? frozenSnapshot : null,
    subcompany,
    parentCompanyName: parentName,
    hasSubcompany: Boolean(effectiveSubcompanyId),
    useSnapshot,
  });
}
