import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type CompanyDeletionArchiveReason = "offboarding_start" | "super_admin_company_delete";

export type CompanyDeletionSnapshot = Record<string, unknown>;

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

export async function gatherCompanyDeletionSnapshot(
  admin: Admin,
  companyId: string,
  reason: CompanyDeletionArchiveReason,
): Promise<{ ok: true; snapshot: CompanyDeletionSnapshot } | { ok: false; error: string }> {
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
  let pricingSnapshots: Record<string, unknown>[] = [];
  if (contract?.id) {
    const cid = contract.id as string;
    const { data: vers, error: vErr } = await admin
      .from("company_contract_versions")
      .select("*")
      .eq("contract_id", cid)
      .order("version_number", { ascending: true });
    if (vErr) console.warn("[company-deletion-archive] versions", vErr.message);
    else contractVersions = (vers ?? []) as Record<string, unknown>[];

    const { data: sigs, error: sigErr } = await admin.from("contract_signature_requests").select("*").eq("contract_id", cid);
    if (sigErr) console.warn("[company-deletion-archive] signature_requests", sigErr.message);
    else signatureRequests = (sigs ?? []) as Record<string, unknown>[];

    const { data: ps, error: psErr } = await admin.from("contract_pricing_snapshots").select("*").eq("contract_id", cid);
    if (psErr) console.warn("[company-deletion-archive] pricing_snapshots", psErr.message);
    else pricingSnapshots = (ps ?? []) as Record<string, unknown>[];
  }

  const { data: changeReqs, error: chErr } = await admin
    .from("company_contract_change_requests")
    .select("*")
    .eq("parent_company_id", companyId);
  if (chErr) console.warn("[company-deletion-archive] change_requests", chErr.message);

  const { data: inv, error: iErr } = await admin.from("invoices").select("*").eq("parent_company_id", companyId);
  if (iErr) console.warn("[company-deletion-archive] invoices", iErr.message);
  const invoices = inv ?? [];
  const invoiceIds = invoices.map((r) => (r as { id: string }).id).filter(Boolean);

  let invoicePaymentSubmissions: Record<string, unknown>[] = [];
  let invoicePaymentValidations: Record<string, unknown>[] = [];
  if (invoiceIds.length > 0) {
    const { data: paySubs, error: subErr } = await admin
      .from("invoice_payment_submissions")
      .select("*")
      .in("invoice_id", invoiceIds);
    if (subErr) console.warn("[company-deletion-archive] payment_submissions", subErr.message);
    else invoicePaymentSubmissions = (paySubs ?? []) as Record<string, unknown>[];

    const subIds = invoicePaymentSubmissions.map((s) => s.id as string).filter(Boolean);
    if (subIds.length > 0) {
      const { data: vals, error: valErr } = await admin
        .from("invoice_payment_validations")
        .select("*")
        .in("submission_id", subIds);
      if (valErr) console.warn("[company-deletion-archive] payment_validations", valErr.message);
      else invoicePaymentValidations = (vals ?? []) as Record<string, unknown>[];
    }
  }

  const { data: sched, error: schErr } = await admin.from("billing_schedules").select("*").eq("parent_company_id", companyId);
  if (schErr) console.warn("[company-deletion-archive] billing_schedules", schErr.message);
  const schedules = sched ?? [];
  const scheduleIds = schedules.map((r) => (r as { id: string }).id).filter(Boolean);

  let billingScheduleItems: Record<string, unknown>[] = [];
  if (scheduleIds.length > 0) {
    const { data: items, error: biErr } = await admin
      .from("billing_schedule_items")
      .select("*")
      .in("schedule_id", scheduleIds);
    if (biErr) console.warn("[company-deletion-archive] billing_schedule_items", biErr.message);
    else billingScheduleItems = (items ?? []) as Record<string, unknown>[];
  }

  let amendments: Record<string, unknown>[] = [];
  if (contract?.id) {
    const { data: am, error: amErr } = await admin
      .from("contract_billing_amendments")
      .select("*")
      .eq("contract_id", contract.id as string)
      .limit(500);
    if (amErr) console.warn("[company-deletion-archive] contract_billing_amendments", amErr.message);
    else amendments = (am ?? []) as Record<string, unknown>[];
  }

  const { data: legal, error: lErr } = await admin
    .from("legal_entity_transitions")
    .select("*")
    .or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`);
  if (lErr) console.warn("[company-deletion-archive] legal_entity_transitions", lErr.message);

  const snapshot: CompanyDeletionSnapshot = {
    schema_version: 2,
    archived_reason: reason,
    company,
    subcompanies: subs ?? [],
    company_contract: contract ?? null,
    contract_versions: contractVersions,
    contract_signature_requests: signatureRequests,
    contract_pricing_snapshots: pricingSnapshots,
    company_contract_change_requests: changeReqs ?? [],
    invoices,
    invoice_payment_submissions: invoicePaymentSubmissions,
    invoice_payment_validations: invoicePaymentValidations,
    billing_schedules: schedules,
    billing_schedule_items: billingScheduleItems,
    contract_billing_amendments: amendments,
    legal_entity_transitions: legal ?? [],
  };

  return { ok: true, snapshot };
}

export async function insertCompanyDeletionArchive(
  admin: Admin,
  companyId: string,
  archivedByUserId: string,
  options?: {
    reason?: CompanyDeletionArchiveReason;
    /** When true, sets company_deletion_archives.company_id for FK while company exists. */
    linkCompanyRow?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = options?.reason ?? "super_admin_company_delete";
  const linkCompanyRow = options?.linkCompanyRow ?? false;

  const built = await gatherCompanyDeletionSnapshot(admin, companyId, reason);
  if (!built.ok) return built;

  const { error: insErr } = await admin.from("company_deletion_archives").insert({
    former_company_id: companyId,
    company_id: linkCompanyRow ? companyId : null,
    archived_by: archivedByUserId,
    snapshot: built.snapshot,
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
