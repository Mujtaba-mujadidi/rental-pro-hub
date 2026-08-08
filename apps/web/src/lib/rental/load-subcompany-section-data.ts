import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import { SUBCOMPANY_SELECT, mapSubcompanyRow, type SubcompanyRow } from "@/lib/rental/subcompany";
import type { SubcompanyDocumentKind, SubcompanyOpenRequirement } from "@/lib/rental/subcompany-workspace-types";
import {
  hireIsEndedForSubcompanyDocumentImpact,
  reconcileEndedHireSubcompanyDocumentRequirements,
} from "@/lib/rental/subcompany-hire-document-requirements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SubcompanyOverviewStats = {
  vehicleCount: number;
  activeHireCount: number;
  pendingHireCount: number;
  totalHireCount: number;
  openRequirementCount: number;
};

export type SubcompanyOverviewData = {
  stats: SubcompanyOverviewStats;
  openRequirements: SubcompanyOpenRequirement[];
};

async function loadSubcompanyRow(
  companyId: string,
  subcompanyId: string,
): Promise<{ ok: true; row: SubcompanyRow } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcompanies")
    .select(SUBCOMPANY_SELECT)
    .eq("id", subcompanyId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Subcompany not found." };
  return { ok: true, row: mapSubcompanyRow(data as Record<string, unknown>) };
}

export async function loadSubcompanyOverviewData(
  companyId: string,
  subcompanyId: string,
): Promise<{ ok: true; data: SubcompanyOverviewData } | { ok: false; error: string }> {
  const loaded = await loadSubcompanyRow(companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  try {
    const admin = createSupabaseAdminClient();
    await reconcileEndedHireSubcompanyDocumentRequirements(admin, {
      subcompanyId: loaded.row.id,
      parentCompanyId: companyId,
    });
  } catch {
    // Non-fatal — overview still loads; stale flags may remain until next reconcile.
  }

  const supabase = await createClient();
  const [
    { count: vehicleCount },
    { count: activeHireCount },
    { count: pendingHireCount },
    { count: totalHireCount },
    { data: reqs },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id)
      .eq("status", "active"),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id)
      .in("status", ["pending_signature", "reserved"]),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id),
    supabase
      .from("subcompany_hire_document_requirements")
      .select("id, hire_group_id, document_kind, agreement_id, inspection_id")
      .eq("subcompany_id", loaded.row.id)
      .eq("status", "required")
      .order("created_at", { ascending: true }),
  ]);

  const hireIds = [...new Set((reqs ?? []).map((r) => r.hire_group_id as string))];
  const labelByHire = new Map<string, string>();
  const statusByHire = new Map<string, string>();
  if (hireIds.length) {
    const { data: hireRows } = await supabase
      .from("vehicle_hire_groups")
      .select("id, status, vehicles(vrm)")
      .in("id", hireIds);
    for (const h of hireRows ?? []) {
      const v = h.vehicles as { vrm?: string } | { vrm?: string }[] | null;
      const vrm = Array.isArray(v) ? v[0]?.vrm : v?.vrm;
      labelByHire.set(h.id as string, vrm?.trim() || "Hire");
      statusByHire.set(h.id as string, String(h.status ?? ""));
    }
  }

  const openRequirements: SubcompanyOpenRequirement[] = (reqs ?? [])
    .filter((r) => !hireIsEndedForSubcompanyDocumentImpact(statusByHire.get(r.hire_group_id as string) ?? ""))
    .map((r) => {
      const hireGroupId = r.hire_group_id as string;
      const documentKind = r.document_kind as SubcompanyDocumentKind;
      const base = labelByHire.get(hireGroupId) ?? "Hire";
      const inspectionHref =
        documentKind === "inspection_checkout"
          ? `/rental/hires/${hireGroupId}/checkout`
          : documentKind === "inspection_checkin"
            ? `/rental/hires/${hireGroupId}/checkin`
            : `/rental/hires/${hireGroupId}/details`;
      return {
        id: r.id as string,
        hireGroupId,
        documentKind,
        agreementId: (r.agreement_id as string | null) ?? null,
        inspectionId: (r.inspection_id as string | null) ?? null,
        label:
          documentKind === "permission_letter"
            ? `${base} · Permission letter`
            : documentKind === "inspection_checkout"
              ? `${base} · Vehicle checkout report`
              : documentKind === "inspection_checkin"
              ? `${base} · Vehicle check-in report`
                : `${base} · Hire agreement`,
        href: inspectionHref,
      };
    });

  return {
    ok: true,
    data: {
      stats: {
        vehicleCount: vehicleCount ?? 0,
        activeHireCount: activeHireCount ?? 0,
        pendingHireCount: pendingHireCount ?? 0,
        totalHireCount: totalHireCount ?? 0,
        openRequirementCount: openRequirements.length,
      },
      openRequirements,
    },
  };
}

export async function loadSubcompanyAuditTrailData(
  companyId: string,
  subcompanyId: string,
): Promise<{ ok: true; events: SubcompanyAuditRow[] } | { ok: false; error: string }> {
  const loaded = await loadSubcompanyRow(companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcompany_events")
    .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
    .eq("subcompany_id", loaded.row.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    events: (data ?? []).map((e) => ({
      id: e.id as string,
      event_type: e.event_type as SubcompanyAuditRow["event_type"],
      actor_user_id: (e.actor_user_id as string | null) ?? null,
      actor_role: (e.actor_role as string | null) ?? null,
      summary: e.summary as string,
      metadata: (e.metadata ?? {}) as Record<string, unknown>,
      created_at: e.created_at as string,
    })),
  };
}
