import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminDriverListRow } from "@/lib/admin/driver-list-shared";

export type DriverListStatusFilter = "all" | "active" | "blocked";

export type FetchDriversPageParams = {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  status: DriverListStatusFilter;
};

export type FetchDriversPageResult =
  | { ok: true; rows: AdminDriverListRow[]; total: number }
  | { ok: false; error: string };

const SORT_COLUMNS: Record<string, string> = {
  created_at: "created_at",
  first_name: "first_name",
  last_name: "last_name",
  account_email: "account_email",
  phone: "phone",
  address_town: "address_town",
  address_postcode: "address_postcode",
};

const MAX_SEARCH_LEN = 200;

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** PostgREST splits `.or()` on commas; quote so commas/wildcards in search do not break the filter. */
function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function mapRow(p: {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_town: string | null;
  address_postcode: string | null;
  created_at: string | null;
  account_email: string | null;
  account_banned_until: string | null;
}): AdminDriverListRow {
  return {
    userId: p.user_id,
    email: p.account_email ?? null,
    firstName: p.first_name ?? "",
    lastName: p.last_name ?? "",
    phone: p.phone ?? "",
    town: p.address_town ?? "",
    postcode: p.address_postcode ?? "",
    registeredAt: p.created_at ?? "",
    bannedUntil: p.account_banned_until ?? null,
  };
}

/**
 * One page of drivers with exact total count — server-only, uses service role.
 */
export async function fetchDriversPage(params: FetchDriversPageParams): Promise<FetchDriversPageResult> {
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
  const nowIso = new Date().toISOString();
  const nowQuoted = quoteOrFilterValue(nowIso);

  let q = admin.from("driver_profiles").select(
    "user_id, first_name, last_name, phone, address_town, address_postcode, created_at, account_email, account_banned_until",
    { count: "exact" },
  );

  if (params.status === "active") {
    q = q.or(`account_banned_until.is.null,account_banned_until.lte.${nowQuoted}`);
  } else if (params.status === "blocked") {
    q = q.filter("account_banned_until", "gt", nowIso);
  }

  if (search.length > 0) {
    const pat = quoteOrFilterValue(`%${escapeIlikePattern(search)}%`);
    q = q.or(
      `first_name.ilike.${pat},last_name.ilike.${pat},phone.ilike.${pat},address_town.ilike.${pat},address_postcode.ilike.${pat},account_email.ilike.${pat}`,
    );
  }

  q = q.order(sortCol, { ascending, nullsFirst: false });

  if (sortCol === "first_name") {
    q = q.order("last_name", { ascending, nullsFirst: false });
  }

  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []).map((p) =>
    mapRow(
      p as {
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        address_town: string | null;
        address_postcode: string | null;
        created_at: string | null;
        account_email: string | null;
        account_banned_until: string | null;
      },
    ),
  );

  return { ok: true, rows, total: count ?? 0 };
}
