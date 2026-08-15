import { ukTodayYmd } from "@/lib/datetime/uk";
import { vehicleExpiryAttentionItems } from "@/lib/fleet/vehicle-expiry-attention";
import {
  hirePaymentRowBalanceGbp,
  isHirePaymentRowAccrued,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { missingRequiredDocTypes } from "@/lib/fleet/vehicles";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import { SUBCOMPANY_SELECT, mapSubcompanyRow, type SubcompanyRow } from "@/lib/rental/subcompany";
import type { SubcompanyDocumentKind, SubcompanyOpenRequirement } from "@/lib/rental/subcompany-workspace-types";
import {
  hireIsEndedForSubcompanyDocumentImpact,
  reconcileEndedHireSubcompanyDocumentRequirements,
} from "@/lib/rental/subcompany-hire-document-requirements";
import {
  mapSubcompanyOverviewActivity,
  subcompanyOverviewComplianceLabel,
  subcompanyOverviewHealth,
  subcompanyOverviewHealthLabel,
  type SubcompanyOverviewActivityItem,
  type SubcompanyOverviewHealth,
} from "@/lib/rental/subcompany-overview-display";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SubcompanyOverviewStats = {
  vehicleCount: number;
  activeHireCount: number;
  pendingHireCount: number;
  totalHireCount: number;
  openRequirementCount: number;
  openBalanceGbp: number;
  openBalanceLabel: string;
  vehicleAttentionCount: number;
  health: SubcompanyOverviewHealth;
  healthLabel: string;
  complianceLabel: string;
};

export type SubcompanyOverviewData = {
  stats: SubcompanyOverviewStats;
  openRequirements: SubcompanyOpenRequirement[];
  recentActivity: SubcompanyOverviewActivityItem[];
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

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadOpenBalanceGbp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subcompanyId: string,
): Promise<number> {
  const today = ukTodayYmd();
  const { data: hires } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, settlement_balance_gbp, settlement_balance_direction")
    .eq("subcompany_id", subcompanyId)
    .not("status", "in", "(draft,cancelled)");

  let total = 0;
  const openHireIds: string[] = [];
  for (const h of hires ?? []) {
    const status = String(h.status ?? "");
    if (status === "completed" || status === "terminated") {
      if (String(h.settlement_balance_direction ?? "") === "driver_owes_company") {
        total += Number(h.settlement_balance_gbp ?? 0);
      }
      continue;
    }
    if (status === "active" || status === "pending_signature" || status === "reserved") {
      openHireIds.push(String(h.id));
    }
  }

  if (openHireIds.length) {
    const { data: scheduleRows } = await supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "period_start, period_end, row_kind, base_amount_gbp, discount_total_gbp, payment_status, approved_amount_gbp",
      )
      .in("hire_group_id", openHireIds)
      .eq("row_kind", "rent");
    for (const row of scheduleRows ?? []) {
      const input: HirePaymentScheduleRowInput = {
        id: "row",
        periodStart: String(row.period_start ?? ""),
        periodEnd: String(row.period_end ?? ""),
        rowKind: "rent",
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp: Number(row.discount_total_gbp ?? 0),
        paymentStatus: (row.payment_status as HirePaymentStatus) ?? "unpaid",
        approvedAmountGbp:
          row.approved_amount_gbp == null ? null : Number(row.approved_amount_gbp),
        pendingSubmittedGbp: null,
        sortOrder: 0,
      };
      if (!isHirePaymentRowAccrued(input, today)) continue;
      const balance = hirePaymentRowBalanceGbp(input);
      if (balance > 0.005) total += balance;
    }
  }

  return roundGbp(Math.max(0, total));
}

async function loadVehicleAttentionCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  subcompanyId: string,
): Promise<number> {
  const [{ data: company }, { data: vehicles }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("vehicles")
      .select("id, mot_expiry, tax_expiry, phv_licence_expiry, status")
      .eq("subcompany_id", subcompanyId)
      .neq("status", "sold"),
  ]);
  const notifySettings = parseCompanyNotificationSettings(company ?? undefined);
  const vehicleIds = (vehicles ?? []).map((v) => String(v.id));
  const docsByVehicle = new Map<string, string[]>();
  if (vehicleIds.length) {
    const versioned = await supabase
      .from("vehicle_documents")
      .select("vehicle_id, doc_type")
      .in("vehicle_id", vehicleIds)
      .eq("version_status", "current");
    const docs =
      versioned.error && String(versioned.error.message).toLowerCase().includes("version_status")
        ? (await supabase.from("vehicle_documents").select("vehicle_id, doc_type").in("vehicle_id", vehicleIds))
            .data
        : versioned.error
          ? null
          : versioned.data;
    for (const d of docs ?? []) {
      const vid = String(d.vehicle_id ?? "");
      if (!vid) continue;
      const list = docsByVehicle.get(vid) ?? [];
      list.push(String(d.doc_type ?? ""));
      docsByVehicle.set(vid, list);
    }
  }

  let attention = 0;
  for (const v of vehicles ?? []) {
    const present = docsByVehicle.get(String(v.id)) ?? [];
    if (missingRequiredDocTypes(present).length > 0) attention += 1;
    attention += vehicleExpiryAttentionItems(
      {
        mot_expiry: (v.mot_expiry as string | null) ?? null,
        tax_expiry: (v.tax_expiry as string | null) ?? null,
        phv_licence_expiry: (v.phv_licence_expiry as string | null) ?? null,
      },
      notifySettings,
    ).length;
  }
  return attention;
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
    openBalanceGbp,
    vehicleAttentionCount,
    { data: eventRows },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id)
      .neq("status", "sold"),
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
    loadOpenBalanceGbp(supabase, loaded.row.id),
    loadVehicleAttentionCount(supabase, companyId, loaded.row.id),
    supabase
      .from("subcompany_events")
      .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
      .eq("subcompany_id", loaded.row.id)
      .order("created_at", { ascending: false })
      .limit(5),
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

  const health = subcompanyOverviewHealth({
    openRequirementCount: openRequirements.length,
    vehicleAttentionCount,
  });

  const auditEvents: SubcompanyAuditRow[] = (eventRows ?? []).map((e) => ({
    id: e.id as string,
    event_type: e.event_type as SubcompanyAuditRow["event_type"],
    actor_user_id: (e.actor_user_id as string | null) ?? null,
    actor_role: (e.actor_role as string | null) ?? null,
    summary: e.summary as string,
    metadata: (e.metadata ?? {}) as Record<string, unknown>,
    created_at: e.created_at as string,
  }));

  return {
    ok: true,
    data: {
      stats: {
        vehicleCount: vehicleCount ?? 0,
        activeHireCount: activeHireCount ?? 0,
        pendingHireCount: pendingHireCount ?? 0,
        totalHireCount: totalHireCount ?? 0,
        openRequirementCount: openRequirements.length,
        openBalanceGbp,
        openBalanceLabel: formatGbp(openBalanceGbp),
        vehicleAttentionCount,
        health,
        healthLabel: subcompanyOverviewHealthLabel(health),
        complianceLabel: subcompanyOverviewComplianceLabel(health),
      },
      openRequirements,
      recentActivity: mapSubcompanyOverviewActivity(auditEvents, 5),
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
