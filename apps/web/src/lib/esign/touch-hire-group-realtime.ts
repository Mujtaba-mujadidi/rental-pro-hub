import { getHireGroupIdForEnvelope } from "@/lib/esign/hire-signing-bundle";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Bump hire group `updated_at` so Supabase Realtime refreshes contract lists. */
export async function touchHireGroupRealtime(admin: Admin, hireGroupId: string): Promise<void> {
  const id = hireGroupId.trim();
  if (!id) return;
  await admin.from("vehicle_hire_groups").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function touchHireGroupForEnvelopeRealtime(admin: Admin, envelopeId: string): Promise<void> {
  const hireGroupId = await getHireGroupIdForEnvelope(admin, envelopeId);
  if (!hireGroupId) return;
  await touchHireGroupRealtime(admin, hireGroupId);
}
