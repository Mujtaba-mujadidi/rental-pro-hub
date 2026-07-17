import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type RentalMembershipRole = "owner" | "admin" | "operations" | "finance" | "viewer";

export async function findAuthUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[auth] listUsers failed", error.message);
      return null;
    }
    const found = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === normalized);
    if (found?.id) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Idempotent: set Auth metadata + profiles + membership for a rental user,
 * and remove any accidental driver_profiles row.
 *
 * Call this after every company/staff invite — do not rely on handle_new_user alone
 * (invite metadata is not always present on the auth.users INSERT).
 */
export async function ensureRentalCompanyMembership(
  admin: AdminClient,
  opts: {
    userId: string;
    companyId: string;
    membershipRole: RentalMembershipRole;
    companyRole: "admin" | "staff";
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    subcompanyScope?: "all" | "explicit";
    /** Required when subcompanyScope is explicit. */
    subcompanyIds?: string[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const first = opts.firstName?.trim() || "";
  const last = opts.lastName?.trim() || "";
  const displayName =
    opts.displayName?.trim() ||
    [first, last].filter(Boolean).join(" ").trim() ||
    "Company user";
  const scope =
    opts.subcompanyScope ??
    (opts.membershipRole === "owner" || opts.membershipRole === "admin" ? "all" : "all");

  const { data: companyRow, error: coErr } = await admin
    .from("companies")
    .select("id")
    .eq("id", opts.companyId)
    .maybeSingle();
  if (coErr) return { ok: false, error: coErr.message };
  if (!companyRow?.id) {
    return { ok: false, error: "Company not found — cannot attach user as rental admin." };
  }

  const { error: metaErr } = await admin.auth.admin.updateUserById(opts.userId, {
    user_metadata: {
      app_role: "rental_company",
      company_role: opts.companyRole,
      company_id: opts.companyId,
      first_name: first,
      last_name: last,
      full_name: displayName,
      rental_membership_role: opts.membershipRole,
      rental_subcompany_scope: scope,
      rental_subcompany_ids: scope === "explicit" ? JSON.stringify(opts.subcompanyIds ?? []) : "[]",
      signup_flow: null,
    },
  });
  if (metaErr) return { ok: false, error: metaErr.message };

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: opts.userId,
      display_name: displayName,
      role: "rental_company",
      company_id: opts.companyId,
      company_role: opts.companyRole,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileErr) return { ok: false, error: profileErr.message };

  const { data: memRow, error: memErr } = await admin
    .from("user_company_memberships")
    .upsert(
      {
        user_id: opts.userId,
        parent_company_id: opts.companyId,
        role: opts.membershipRole,
        subcompany_scope: scope,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,parent_company_id" },
    )
    .select("id")
    .maybeSingle();
  if (memErr) return { ok: false, error: memErr.message };

  const membershipId = memRow?.id as string | undefined;
  if (membershipId) {
    await admin.from("user_subcompany_permissions").delete().eq("membership_id", membershipId);
    if (scope === "explicit") {
      const ids = [...new Set((opts.subcompanyIds ?? []).map((x) => x.trim()).filter(Boolean))];
      if (ids.length > 0) {
        const { error: permErr } = await admin.from("user_subcompany_permissions").insert(
          ids.map((subcompany_id) => ({ membership_id: membershipId, subcompany_id })),
        );
        if (permErr) return { ok: false, error: permErr.message };
      }
    }
  }

  // Never leave a company contact with a driver profile row.
  await admin.from("driver_profiles").delete().eq("user_id", opts.userId);

  return { ok: true };
}
