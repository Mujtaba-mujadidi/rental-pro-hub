"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SetFleetTrackingEnabledResult = { ok: true } | { ok: false; error: string };

export async function setCompanyFleetTrackingEnabledAction(
  companyId: string,
  enabled: boolean,
): Promise<SetFleetTrackingEnabledResult> {
  await requireSuperAdmin();
  const id = companyId.trim();
  if (!id) return { ok: false, error: "Missing company." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("companies")
    .update({ fleet_tracking_enabled: Boolean(enabled) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/super-admin/companies");
  revalidatePath("/rental/fleet-tracking");
  return { ok: true };
}
