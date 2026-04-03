import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * FK reference summary for `public.companies(id)` (on delete unless noted):
 * CASCADE: subcompanies.parent_company_id; user_company_memberships.parent_company_id;
 * staff_invitations.parent_company_id; company_contracts.parent_company_id;
 * company_contract_change_requests.parent_company_id; billing_schedules.parent_company_id;
 * invoices.parent_company_id; legal_entity_transitions.from_company_id / to_company_id.
 * SET NULL: profiles.company_id; company_contracts.current_version_id (via versions);
 * superseded_by_company_id on change requests (if present).
 * Children of company_contracts (versions, signatures, pricing snapshots, schedules) cascade via contract.
 */

export async function insertCompanyDeletionArchive(
  admin: Admin,
  companyId: string,
  archivedByUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: company, error: cErr } = await admin.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!company) return { ok: false, error: "Company not found." };

  const { data: subs, error: sErr } = await admin.from("subcompanies").select("*").eq("parent_company_id", companyId);
  if (sErr) console.warn("[company-deletion-archive] subcompanies", sErr.message);

  const { data: contract, error: coErr } = await admin
    .from("company_contracts")
    .select("*")
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (coErr) console.warn("[company-deletion-archive] company_contracts", coErr.message);

  let contractVersions: Record<string, unknown>[] = [];
  let signatureRequests: Record<string, unknown>[] = [];
  if (contract?.id) {
    const { data: vers, error: vErr } = await admin
      .from("company_contract_versions")
      .select("*")
      .eq("contract_id", contract.id as string)
      .order("version_number", { ascending: true });
    if (vErr) console.warn("[company-deletion-archive] versions", vErr.message);
    else contractVersions = (vers ?? []) as Record<string, unknown>[];

    const { data: sigs, error: sigErr } = await admin
      .from("contract_signature_requests")
      .select("*")
      .eq("contract_id", contract.id as string);
    if (sigErr) console.warn("[company-deletion-archive] signature_requests", sigErr.message);
    else signatureRequests = (sigs ?? []) as Record<string, unknown>[];
  }

  const { data: changeReqs, error: chErr } = await admin
    .from("company_contract_change_requests")
    .select("*")
    .eq("parent_company_id", companyId);
  if (chErr) console.warn("[company-deletion-archive] change_requests", chErr.message);

  const { data: inv, error: iErr } = await admin.from("invoices").select("*").eq("parent_company_id", companyId);
  if (iErr) console.warn("[company-deletion-archive] invoices", iErr.message);

  const { data: sched, error: schErr } = await admin.from("billing_schedules").select("*").eq("parent_company_id", companyId);
  if (schErr) console.warn("[company-deletion-archive] billing_schedules", schErr.message);

  const { data: legal, error: lErr } = await admin
    .from("legal_entity_transitions")
    .select("*")
    .or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`);
  if (lErr) console.warn("[company-deletion-archive] legal_entity_transitions", lErr.message);

  const snapshot = {
    schema_version: 1 as const,
    archived_reason: "super_admin_company_delete" as const,
    company,
    subcompanies: subs ?? [],
    company_contract: contract ?? null,
    contract_versions: contractVersions,
    contract_signature_requests: signatureRequests,
    company_contract_change_requests: changeReqs ?? [],
    invoices: inv ?? [],
    billing_schedules: sched ?? [],
    legal_entity_transitions: legal ?? [],
  };

  const { error: insErr } = await admin.from("company_deletion_archives").insert({
    former_company_id: companyId,
    archived_by: archivedByUserId,
    snapshot,
  });

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

/** User IDs tied to this tenant: memberships + profiles.company_id (rental). */
export async function collectTenantAuthUserIds(admin: Admin, companyId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: mems, error: mErr } = await admin
    .from("user_company_memberships")
    .select("user_id")
    .eq("parent_company_id", companyId);
  if (mErr) console.warn("[deleteCompany] memberships list", mErr.message);
  for (const m of mems ?? []) {
    const uid = m.user_id as string | undefined;
    if (uid) ids.add(uid);
  }

  const { data: profs, error: pErr } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "rental_company");
  if (pErr) console.warn("[deleteCompany] profiles by company_id", pErr.message);
  for (const p of profs ?? []) {
    const id = p.id as string | undefined;
    if (id) ids.add(id);
  }

  return [...ids];
}
