import type { SupabaseClient } from "@supabase/supabase-js";
import type { RentalSubcompanyListRow } from "@/lib/rental/subcompany-list-shared";

export type RentalSubcompanyStatusFilter = "all" | "active" | "inactive" | "pending";

export type FetchRentalSubcompaniesPageParams = {
  parentCompanyId: string;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: RentalSubcompanyStatusFilter;
};

export type FetchRentalSubcompaniesPageResult =
  | { ok: true; rows: RentalSubcompanyListRow[]; total: number }
  | { ok: false; error: string };

const SORT_COLUMNS: Record<string, string> = {
  created_at: "created_at",
  name: "name",
  primary_contact_email: "primary_contact_email",
  registered_town: "registered_town",
  registered_postcode: "registered_postcode",
  status: "status",
};

const MAX_SEARCH_LEN = 200;

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function mapRow(r: {
  id: string;
  is_primary: boolean | null;
  name: string;
  legal_name: string | null;
  company_number: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  registered_town: string | null;
  registered_postcode: string | null;
  status: string;
  created_at: string | null;
}): RentalSubcompanyListRow {
  return {
    id: r.id,
    isPrimary: !!r.is_primary,
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
    createdAt: r.created_at ?? "",
  };
}

/**
 * Uses the caller’s Supabase client (user session) so RLS applies — users with explicit subcompany scope only see rows
 * they are allowed to select.
 */
export async function fetchRentalSubcompaniesPage(
  supabase: SupabaseClient,
  params: FetchRentalSubcompaniesPageParams,
): Promise<FetchRentalSubcompaniesPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize)));
  const search = params.search.trim().slice(0, MAX_SEARCH_LEN);
  const sortCol = SORT_COLUMNS[params.sortBy] ?? "created_at";
  const ascending = params.sortDir !== "desc";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("subcompanies")
    .select(
      "id, is_primary, name, legal_name, company_number, primary_contact_first_name, primary_contact_last_name, primary_contact_email, primary_contact_phone, registered_town, registered_postcode, status, created_at",
      { count: "exact" },
    )
    .eq("parent_company_id", params.parentCompanyId);

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
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []).map((row) =>
    mapRow(
      row as {
        id: string;
        is_primary: boolean | null;
        name: string;
        legal_name: string | null;
        company_number: string | null;
        primary_contact_first_name: string | null;
        primary_contact_last_name: string | null;
        primary_contact_email: string | null;
        primary_contact_phone: string | null;
        registered_town: string | null;
        registered_postcode: string | null;
        status: string;
        created_at: string | null;
      },
    ),
  );

  return { ok: true, rows, total: count ?? 0 };
}
