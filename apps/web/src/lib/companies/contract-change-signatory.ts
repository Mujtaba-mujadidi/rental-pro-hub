import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ContractSignatoryDefaults = {
  name: string;
  email: string;
};

export type OwnerContact = {
  displayName: string | null;
  email: string | null;
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Resolve e-sign recipient from explicit signatory fields, then owner, then primary contact. */
export function resolveContractSignatoryFromSources(sources: {
  signatoryName?: string | null;
  signatoryEmail?: string | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  primaryContactFirstName?: string | null;
  primaryContactLastName?: string | null;
  primaryContactEmail?: string | null;
}): ContractSignatoryDefaults {
  const email =
    sources.signatoryEmail?.trim() ||
    sources.ownerEmail?.trim() ||
    sources.primaryContactEmail?.trim() ||
    "";

  const name =
    sources.signatoryName?.trim() ||
    sources.ownerDisplayName?.trim() ||
    [sources.primaryContactFirstName, sources.primaryContactLastName].filter(Boolean).join(" ").trim() ||
    "";

  return { name, email };
}

/** Active company owner display name + login email (first owner membership). */
export async function loadOwnerContactsByCompanyIds(
  admin: Admin,
  companyIds: string[],
): Promise<Map<string, OwnerContact>> {
  const result = new Map<string, OwnerContact>();
  const ids = [...new Set(companyIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return result;

  const { data: memberships } = await admin
    .from("user_company_memberships")
    .select("parent_company_id, user_id, created_at")
    .in("parent_company_id", ids)
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const ownerUserByCompany = new Map<string, string>();
  for (const row of memberships ?? []) {
    const companyId = row.parent_company_id as string;
    if (!ownerUserByCompany.has(companyId)) {
      ownerUserByCompany.set(companyId, row.user_id as string);
    }
  }

  const userIds = [...new Set(ownerUserByCompany.values())];
  const displayNameByUser = new Map<string, string | null>();
  const emailByUser = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", userIds);
    for (const profile of profiles ?? []) {
      displayNameByUser.set(profile.id, (profile.display_name as string | null)?.trim() || null);
    }
    await Promise.all(
      userIds.map(async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (!error && data.user?.email) {
          emailByUser.set(userId, data.user.email.trim());
        }
      }),
    );
  }

  for (const [companyId, userId] of ownerUserByCompany) {
    result.set(companyId, {
      displayName: displayNameByUser.get(userId) ?? null,
      email: emailByUser.get(userId) ?? null,
    });
  }

  return result;
}

export async function loadParentCompanyOwnerContact(
  admin: Admin,
  parentCompanyId: string,
): Promise<OwnerContact> {
  const map = await loadOwnerContactsByCompanyIds(admin, [parentCompanyId]);
  return map.get(parentCompanyId.trim()) ?? { displayName: null, email: null };
}
