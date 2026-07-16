import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export async function appendEsignAudit(
  admin: Admin,
  envelopeId: string,
  eventType: string,
  opts?: {
    actor?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("esign_audit_events").insert({
    envelope_id: envelopeId,
    event_type: eventType,
    actor: opts?.actor ?? null,
    ip: opts?.ip ?? null,
    user_agent: opts?.userAgent ?? null,
    metadata: opts?.metadata ?? {},
  });
}
