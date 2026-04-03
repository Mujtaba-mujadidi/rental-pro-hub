import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PlatformNotificationType =
  | "contract_signed"
  | "payment_submitted"
  | "payment_validated"
  | "legal_change_applied"
  | "contract_change_requested"
  | "contract_change_review";

export async function notifyUserIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userIds: string[],
  type: PlatformNotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  const rows = unique.map((user_id) => ({ user_id, type, payload }));
  const { error } = await admin.from("platform_notifications").insert(rows);
  if (error) {
    console.error("notifyUserIds", error.message);
  }
}

/** Notify active owner/admin/finance members for a parent company. */
export async function notifySuperAdmins(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  type: PlatformNotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin.from("profiles").select("id").eq("role", "super_admin");
  if (error) {
    console.error("notifySuperAdmins", error.message);
    return;
  }
  await notifyUserIds(
    admin,
    (data ?? []).map((r) => r.id as string),
    type,
    payload,
  );
}

export async function notifyCompanyFinanceRoles(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  parentCompanyId: string,
  type: PlatformNotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin
    .from("user_company_memberships")
    .select("user_id")
    .eq("parent_company_id", parentCompanyId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "finance"]);
  if (error) {
    console.error("notifyCompanyFinanceRoles", error.message);
    return;
  }
  const ids = (data ?? []).map((r) => r.user_id as string);
  await notifyUserIds(admin, ids, type, payload);
}
