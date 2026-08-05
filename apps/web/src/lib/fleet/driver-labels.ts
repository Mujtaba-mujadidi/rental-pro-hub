import type { SupabaseClient } from "@supabase/supabase-js";

function driverLabel(row: {
  first_name: string | null;
  last_name: string | null;
  account_email: string | null;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.account_email || "Driver";
}

/**
 * Load display labels for known driver user IDs via service role.
 * Call only after the caller has authorised tenant scope and narrowed IDs
 * (e.g. drivers already linked to the company / hire rows in that tenant).
 * Not a server action — must not be callable from the browser directly.
 */
export async function loadDriverLabelsMap(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data } = await admin
    .from("driver_profiles")
    .select("user_id, first_name, last_name, account_email")
    .in("user_id", ids);

  const map = new Map<string, string>();
  for (const d of data ?? []) {
    map.set(d.user_id as string, driverLabel(d));
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, "Driver");
  }
  return map;
}
