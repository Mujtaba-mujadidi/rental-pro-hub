import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminCompanyListRow } from "@/lib/admin/company-list-shared";

export type CompanyListStatusFilter = "all" | "active" | "inactive" | "pending";

export type FetchCompaniesPageParams = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: CompanyListStatusFilter;
};

export type FetchCompaniesPageResult =
  | { ok: true; rows: AdminCompanyListRow[]; total: number }
  | { ok: false; error: string };

const SORT_COLUMNS: Record<string, string> = {
  created_at: "created_at",
  name: "name",
  primary_contact_email: "primary_contact_email",
  status: "status",
};

const MAX_SEARCH_LEN = 200;

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeDeletionPhase(v: string | null | undefined): "active" | "offboarding" | "access_blocked" {
  if (v === "offboarding" || v === "access_blocked") return v;
  return "active";
}

/** Latest agreement status per parent company (one cheap query for the page). */
async function agreementStatusByCompanyId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!companyIds.length) return out;

  const { data, error } = await admin
    .from("company_contracts")
    .select("parent_company_id, status, updated_at")
    .in("parent_company_id", companyIds)
    .order("updated_at", { ascending: false });

  if (error || !data) return out;

  for (const row of data) {
    const id = row.parent_company_id as string | null;
    if (!id || out.has(id)) continue;
    out.set(id, String(row.status ?? ""));
  }
  return out;
}

function mapRow(
  r: {
    id: string;
    name: string;
    legal_name: string | null;
    company_number: string | null;
    primary_contact_first_name: string | null;
    primary_contact_last_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    primary_contact_user_id?: string | null;
    registered_town: string | null;
    registered_postcode: string | null;
    logo_storage_path: string | null;
    status: string;
    contract_status: string | null;
    created_at: string | null;
    invite_last_sent_at: string | null;
    deletion_phase?: string | null;
    offboarding_ends_at?: string | null;
  },
  agreementById: Map<string, string>,
): AdminCompanyListRow {
  const uid = r.primary_contact_user_id?.trim() || null;
  return {
    id: r.id,
    name: r.name ?? "",
    legalName: r.legal_name,
    companyNumber: r.company_number,
    contactFirstName: r.primary_contact_first_name,
    contactLastName: r.primary_contact_last_name,
    email: r.primary_contact_email,
    phone: r.primary_contact_phone,
    town: r.registered_town,
    postcode: r.registered_postcode,
    status: r.status ?? "active",
    contractStatus: r.contract_status,
    agreementContractStatus: agreementById.get(r.id) || null,
    createdAt: r.created_at ?? "",
    hasLogo: r.logo_storage_path != null && r.logo_storage_path.length > 0,
    inviteLastSentAt: r.invite_last_sent_at,
    primaryContactUserId: uid,
    /** Resolved lazily when the row menu opens (avoids N Auth Admin calls on list load). */
    primaryContactHasSignedIn: null,
    deletionPhase: normalizeDeletionPhase(r.deletion_phase),
    offboardingEndsAt: r.offboarding_ends_at ?? null,
  };
}

export async function fetchCompaniesPage(params: FetchCompaniesPageParams): Promise<FetchCompaniesPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize)));
  const search = params.search.trim().slice(0, MAX_SEARCH_LEN);
  const sortCol = SORT_COLUMNS[params.sortBy] ?? "created_at";
  const ascending = params.sortDir !== "desc";

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = admin
    .from("companies")
    .select(
      "id, name, legal_name, company_number, primary_contact_first_name, primary_contact_last_name, primary_contact_email, primary_contact_phone, primary_contact_user_id, registered_town, registered_postcode, logo_storage_path, status, contract_status, created_at, invite_last_sent_at, deletion_phase, offboarding_ends_at",
      { count: "exact" },
    );

  if (params.status !== "all") {
    q = q.eq("status", params.status);
  }

  if (search.length > 0) {
    const pat = quoteOrFilterValue(`%${escapeIlikePattern(search)}%`);
    q = q.or(
      `name.ilike.${pat},legal_name.ilike.${pat},company_number.ilike.${pat},primary_contact_email.ilike.${pat},primary_contact_phone.ilike.${pat},primary_contact_first_name.ilike.${pat},primary_contact_last_name.ilike.${pat},registered_town.ilike.${pat},registered_postcode.ilike.${pat},registered_address_line1.ilike.${pat}`,
    );
  }

  q = q.order(sortCol, { ascending, nullsFirst: false });

  if (sortCol === "name") {
    q = q.order("created_at", { ascending: false, nullsFirst: false });
  }

  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = (data ?? []) as {
    id: string;
    name: string;
    legal_name: string | null;
    company_number: string | null;
    primary_contact_first_name: string | null;
    primary_contact_last_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    primary_contact_user_id?: string | null;
    registered_town: string | null;
    registered_postcode: string | null;
    logo_storage_path: string | null;
    status: string;
    contract_status: string | null;
    created_at: string | null;
    invite_last_sent_at: string | null;
    deletion_phase?: string | null;
    offboarding_ends_at?: string | null;
  }[];

  const agreementById = await agreementStatusByCompanyId(
    admin,
    raw.map((row) => row.id),
  );

  const rows = raw.map((row) => mapRow(row, agreementById));

  return { ok: true, rows, total: count ?? 0 };
}

/** Single Auth Admin lookup — used when a row menu opens, not on list load. */
export async function fetchPrimaryContactHasSignedIn(
  userId: string,
): Promise<{ ok: true; hasSignedIn: boolean } | { ok: false; error: string }> {
  const id = userId?.trim();
  if (!id) return { ok: true, hasSignedIn: false };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, hasSignedIn: Boolean(data?.user?.last_sign_in_at) };
}
