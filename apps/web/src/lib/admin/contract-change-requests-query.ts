import {
  buildContractChangeDiff,
  proposedSnapshotFromChangeRequest,
  type ContractChangeDiffRow,
  type ContractChangeFieldSnapshot,
} from "@/lib/companies/contract-change-diff";
import type { ContractChangeHistoryRow } from "@/lib/admin/contract-change-display";
import { resolveCanonicalPlatformEsignEnvelopeIds } from "@/lib/esign/open-agreement-change-esign";
import {
  loadOwnerContactsByCompanyIds,
  resolveContractSignatoryFromSources,
} from "@/lib/companies/contract-change-signatory";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminContractChangeRequestRow = {
  id: string;
  parent_company_id: string;
  status: string;
  review_status: string;
  transition_type: string;
  created_at: string;
  proposed_name: string | null;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string | null;
  proposed_primary_contact_first_name: string | null;
  proposed_primary_contact_last_name: string | null;
  proposed_primary_contact_dob: string | null;
  proposed_primary_contact_phone: string | null;
  proposed_primary_contact_email: string | null;
  proposed_notes: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
  esign_envelope_id: string | null;
  companyName: string | null;
  resolvedSignatoryName: string;
  resolvedSignatoryEmail: string;
  current: ContractChangeFieldSnapshot;
  diff: ContractChangeDiffRow[];
};

export type AdminStuckContractRenewalRow = {
  companyId: string;
  companyName: string | null;
  latestRequest: {
    id: string;
    status: string;
    review_status: string;
    created_at: string;
    proposed_name: string | null;
  } | null;
};

export type FetchAdminContractChangeQueueResult =
  | { ok: true; openRequests: AdminContractChangeRequestRow[]; stuckRenewals: AdminStuckContractRenewalRow[] }
  | { ok: false; error: string };

type ChangeRequestDbRow = {
  id: string;
  parent_company_id: string;
  status: string;
  review_status: string;
  transition_type: string;
  created_at: string;
  proposed_name: string | null;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string | null;
  proposed_primary_contact_first_name: string | null;
  proposed_primary_contact_last_name: string | null;
  proposed_primary_contact_dob: string | null;
  proposed_primary_contact_phone: string | null;
  proposed_primary_contact_email: string | null;
  proposed_notes: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
  esign_envelope_id: string | null;
};

type CompanyDbRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  company_number: string | null;
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_town: string | null;
  registered_county: string | null;
  registered_postcode: string | null;
  country: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_dob: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  notes: string | null;
};

function currentSnapshotFromCompany(company: CompanyDbRow): ContractChangeFieldSnapshot {
  return {
    name: company.name,
    legal_name: company.legal_name,
    company_number: company.company_number,
    registered_address_line1: company.registered_address_line1,
    registered_address_line2: company.registered_address_line2,
    registered_town: company.registered_town,
    registered_county: company.registered_county,
    registered_postcode: company.registered_postcode,
    country: company.country,
    primary_contact_first_name: company.primary_contact_first_name,
    primary_contact_last_name: company.primary_contact_last_name,
    primary_contact_dob: company.primary_contact_dob,
    primary_contact_phone: company.primary_contact_phone,
    primary_contact_email: company.primary_contact_email,
    notes: company.notes,
  };
}

function mapOpenRequest(
  row: ChangeRequestDbRow,
  company: CompanyDbRow | null,
  owner: { displayName: string | null; email: string | null } | undefined,
): AdminContractChangeRequestRow {
  const current = company ? currentSnapshotFromCompany(company) : currentSnapshotFromCompany({ id: row.parent_company_id } as CompanyDbRow);
  const proposed = proposedSnapshotFromChangeRequest(row);
  const resolved = resolveContractSignatoryFromSources({
    signatoryName: row.signatory_name,
    signatoryEmail: row.signatory_email,
    ownerDisplayName: owner?.displayName,
    ownerEmail: owner?.email,
    primaryContactFirstName: row.proposed_primary_contact_first_name ?? company?.primary_contact_first_name,
    primaryContactLastName: row.proposed_primary_contact_last_name ?? company?.primary_contact_last_name,
    primaryContactEmail: row.proposed_primary_contact_email ?? company?.primary_contact_email,
  });
  return {
    ...row,
    companyName: company?.name ?? null,
    resolvedSignatoryName: resolved.name,
    resolvedSignatoryEmail: resolved.email,
    current,
    diff: buildContractChangeDiff(current, proposed),
  };
}

export async function fetchAdminContractChangeQueue(): Promise<FetchAdminContractChangeQueueResult> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: openRows, error: openErr } = await admin
    .from("company_contract_change_requests")
    .select(
      "id, parent_company_id, status, review_status, transition_type, created_at, proposed_name, proposed_legal_name, proposed_company_number, proposed_registered_address_line1, proposed_registered_address_line2, proposed_registered_town, proposed_registered_county, proposed_registered_postcode, proposed_country, proposed_primary_contact_first_name, proposed_primary_contact_last_name, proposed_primary_contact_dob, proposed_primary_contact_phone, proposed_primary_contact_email, proposed_notes, signatory_name, signatory_email, signatory_title, esign_envelope_id",
    )
    .eq("status", "pending_signature")
    .order("created_at", { ascending: false })
    .limit(100);

  if (openErr) return { ok: false, error: openErr.message };

  const openParentIds = [...new Set((openRows ?? []).map((r) => r.parent_company_id))];
  const companyById = new Map<string, CompanyDbRow>();
  const ownerByCompanyId = await loadOwnerContactsByCompanyIds(admin, openParentIds);

  if (openParentIds.length > 0) {
    const { data: companies } = await admin
      .from("companies")
      .select(
        "id, name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, notes",
      )
      .in("id", openParentIds);
    for (const company of companies ?? []) {
      companyById.set(company.id, company as CompanyDbRow);
    }
  }

  const canonicalEsignByCompany = await resolveCanonicalPlatformEsignEnvelopeIds(admin, openParentIds);

  const openRequests = (openRows ?? []).map((row) => {
    const mapped = mapOpenRequest(
      row as ChangeRequestDbRow,
      companyById.get(row.parent_company_id) ?? null,
      ownerByCompanyId.get(row.parent_company_id),
    );
    const canonicalEnvelopeId = canonicalEsignByCompany.get(row.parent_company_id) ?? null;
    if (!canonicalEnvelopeId || canonicalEnvelopeId === mapped.esign_envelope_id) {
      return mapped;
    }
    return { ...mapped, esign_envelope_id: canonicalEnvelopeId };
  });

  const { data: renewalCompanies, error: renewalErr } = await admin
    .from("companies")
    .select("id, name")
    .eq("contract_status", "pending_renewal")
    .order("name", { ascending: true });

  if (renewalErr) return { ok: false, error: renewalErr.message };

  const openParentSet = new Set(openParentIds);
  const stuckCompanyRows = (renewalCompanies ?? []).filter((c) => !openParentSet.has(c.id));

  const stuckRenewals: AdminStuckContractRenewalRow[] = [];
  for (const company of stuckCompanyRows) {
    const { data: latest } = await admin
      .from("company_contract_change_requests")
      .select("id, status, review_status, created_at, proposed_name")
      .eq("parent_company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    stuckRenewals.push({
      companyId: company.id,
      companyName: company.name,
      latestRequest: latest ?? null,
    });
  }

  return { ok: true, openRequests, stuckRenewals };
}

export type FetchContractChangeHistoryResult =
  | { ok: true; rows: ContractChangeHistoryRow[] }
  | { ok: false; error: string };

export async function fetchContractChangeHistoryForCompany(
  parentCompanyId: string,
): Promise<FetchContractChangeHistoryResult> {
  const companyId = parentCompanyId.trim();
  if (!companyId) return { ok: false, error: "Missing company." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data, error } = await admin
    .from("company_contract_change_requests")
    .select(
      "id, created_at, status, review_status, reviewed_at, review_comment, signed_at, transition_type",
    )
    .eq("parent_company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as ContractChangeHistoryRow[] };
}
