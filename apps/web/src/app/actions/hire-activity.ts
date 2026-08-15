"use server";

import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import {
  buildHireActivityExportCsv,
  buildHireActivityItems,
  hireActivityExportFileName,
  type HireActivityItem,
} from "@/lib/fleet/hire-activity-display";
import { loadHireAuditActorDisplayNames, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActivityResult =
  | { ok: true; items: HireActivityItem[] }
  | { ok: false; error: string };

async function loadAuthorisedHireEvents(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<{ ok: true; events: HireGroupAuditRow[] } | { ok: false; error: string }> {
  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();

  if (audience === "staff") {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    const { data: group } = await supabase
      .from("vehicle_hire_groups")
      .select("id, parent_company_id")
      .eq("id", id)
      .eq("parent_company_id", profile.company_id ?? "")
      .maybeSingle();
    if (!group) return { ok: false, error: "Hire not found." };
  } else {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Sign in required." };
    const { data: group } = await supabase
      .from("vehicle_hire_groups")
      .select("id, driver_user_id")
      .eq("id", id)
      .eq("driver_user_id", user.id)
      .maybeSingle();
    if (!group) return { ok: false, error: "Hire not found." };
  }

  const { data, error } = await supabase
    .from("vehicle_hire_group_events")
    .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
    .eq("hire_group_id", id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    events: (data ?? []).map((row) => ({
      id: row.id as string,
      event_type: row.event_type as HireGroupAuditRow["event_type"],
      actor_user_id: row.actor_user_id as string | null,
      actor_role: row.actor_role as HireGroupAuditRow["actor_role"],
      summary: row.summary as string,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      created_at: row.created_at as string,
    })),
  };
}

export async function loadHireActivityAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<ActivityResult> {
  const loaded = await loadAuthorisedHireEvents(hireGroupId, audience);
  if (!loaded.ok) return loaded;
  let actorNames: Record<string, string> = {};
  if (audience === "staff") {
    try {
      actorNames = await loadHireAuditActorDisplayNames(
        createSupabaseAdminClient(),
        loaded.events.map((event) => event.actor_user_id),
      );
    } catch {
      actorNames = {};
    }
  }
  return {
    ok: true,
    items: buildHireActivityItems(loaded.events, { audience, actorNames }),
  };
}

export async function exportHireActivityAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<{ ok: true; csv: string; fileName: string } | { ok: false; error: string }> {
  const loaded = await loadHireActivityAction(hireGroupId, audience);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    csv: buildHireActivityExportCsv(loaded.items, audience),
    fileName: hireActivityExportFileName(hireGroupId),
  };
}
