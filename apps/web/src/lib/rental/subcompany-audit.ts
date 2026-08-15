import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const SUBCOMPANY_EVENT_TYPES = [
  "created",
  "updated",
  "logo_changed",
  "deactivated",
  "contracts_impact_answered",
] as const;

export type SubcompanyEventType = (typeof SUBCOMPANY_EVENT_TYPES)[number];

export type SubcompanyAuditRow = {
  id: string;
  event_type: SubcompanyEventType;
  actor_user_id: string | null;
  actor_role: string | null;
  /** Resolved display name for staff activity views. */
  actor_display_name?: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function logSubcompanyEvent(
  admin: Admin,
  input: {
    subcompanyId: string;
    parentCompanyId: string;
    eventType: SubcompanyEventType;
    summary: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("subcompany_events").insert({
    subcompany_id: input.subcompanyId,
    parent_company_id: input.parentCompanyId,
    event_type: input.eventType,
    summary: input.summary,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[subcompany-audit] insert failed", error.message);
  }
}
