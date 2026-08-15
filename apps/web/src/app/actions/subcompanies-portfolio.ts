"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import {
  vehicleExpiryAttentionItems,
} from "@/lib/fleet/vehicle-expiry-attention";
import { missingRequiredDocTypes } from "@/lib/fleet/vehicles";
import {
  buildSubcompanyPortfolioPayload,
  type SubcompanyPortfolioPayload,
} from "@/lib/rental/subcompanies-portfolio-display";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { createClient } from "@/lib/supabase/server";

type LoadResult =
  | { ok: true; data: SubcompanyPortfolioPayload }
  | { ok: false; error: string };

function chunkIds<T>(ids: T[], size = 200): T[][] {
  if (!ids.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function isMissingVehicleDocVersionStatusColumn(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("version_status") && message.includes("column");
}

async function loadNotifySettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
) {
  const { data } = await supabase
    .from("companies")
    .select(
      "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
    )
    .eq("id", parentCompanyId)
    .maybeSingle();
  return parseCompanyNotificationSettings(data ?? undefined);
}

/**
 * Subcompanies portfolio for the signed-in rental staff user.
 * Scoped to the authorised parent company and accessible subcompanies only.
 */
export async function loadSubcompaniesPortfolioAction(): Promise<LoadResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "Missing rental company context." };

  const accessible = await loadUserAccessibleSubcompanyIds(profile);
  if (accessible !== "all" && accessible.length === 0) {
    return { ok: true, data: buildSubcompanyPortfolioPayload([]) };
  }

  const supabase = await createClient();
  const notifySettings = await loadNotifySettings(supabase, parentCompanyId);

  let query = supabase
    .from("subcompanies")
    .select("id, name, is_primary, status")
    .eq("parent_company_id", parentCompanyId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (accessible !== "all") {
    query = query.in("id", accessible);
  }

  const { data: subRows, error: subError } = await query;
  if (subError) return { ok: false, error: subError.message };

  const subs = (subRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Subcompany"),
    isPrimary: Boolean(row.is_primary),
  }));
  if (!subs.length) {
    return { ok: true, data: buildSubcompanyPortfolioPayload([]) };
  }

  const subIds = subs.map((s) => s.id);
  const vehicleCountBySub = new Map<string, number>();
  const activeHireCountBySub = new Map<string, number>();
  const attentionBySub = new Map<string, number>();
  for (const id of subIds) {
    vehicleCountBySub.set(id, 0);
    activeHireCountBySub.set(id, 0);
    attentionBySub.set(id, 0);
  }

  const vehicles: {
    id: string;
    subcompany_id: string;
    mot_expiry: string | null;
    tax_expiry: string | null;
    phv_licence_expiry: string | null;
  }[] = [];

  for (const ids of chunkIds(subIds)) {
    const [{ data: vehicleRows }, { data: hireRows }, { data: reqRows }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, subcompany_id, status, mot_expiry, tax_expiry, phv_licence_expiry")
        .eq("parent_company_id", parentCompanyId)
        .in("subcompany_id", ids)
        .neq("status", "sold"),
      supabase
        .from("vehicle_hire_groups")
        .select("id, subcompany_id")
        .eq("parent_company_id", parentCompanyId)
        .in("subcompany_id", ids)
        .eq("status", "active"),
      // Table has no parent_company_id; scope via accessible subcompany ids only.
      supabase
        .from("subcompany_hire_document_requirements")
        .select("id, subcompany_id")
        .in("subcompany_id", ids)
        .eq("status", "required"),
    ]);

    for (const v of vehicleRows ?? []) {
      const sid = String(v.subcompany_id ?? "");
      if (!sid) continue;
      vehicleCountBySub.set(sid, (vehicleCountBySub.get(sid) ?? 0) + 1);
      vehicles.push({
        id: String(v.id),
        subcompany_id: sid,
        mot_expiry: (v.mot_expiry as string | null) ?? null,
        tax_expiry: (v.tax_expiry as string | null) ?? null,
        phv_licence_expiry: (v.phv_licence_expiry as string | null) ?? null,
      });
    }

    for (const h of hireRows ?? []) {
      const sid = String(h.subcompany_id ?? "");
      if (!sid) continue;
      activeHireCountBySub.set(sid, (activeHireCountBySub.get(sid) ?? 0) + 1);
    }

    for (const r of reqRows ?? []) {
      const sid = String(r.subcompany_id ?? "");
      if (!sid) continue;
      attentionBySub.set(sid, (attentionBySub.get(sid) ?? 0) + 1);
    }
  }

  const docsByVehicle = new Map<string, string[]>();
  const vehicleIds = vehicles.map((v) => v.id);
  for (const ids of chunkIds(vehicleIds)) {
    const versioned = await supabase
      .from("vehicle_documents")
      .select("vehicle_id, doc_type")
      .in("vehicle_id", ids)
      .eq("version_status", "current");

    const docs =
      versioned.error && isMissingVehicleDocVersionStatusColumn(versioned.error)
        ? (
            await supabase
              .from("vehicle_documents")
              .select("vehicle_id, doc_type")
              .in("vehicle_id", ids)
          ).data
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

  for (const v of vehicles) {
    let n = 0;
    if (missingRequiredDocTypes(docsByVehicle.get(v.id) ?? []).length > 0) n += 1;
    n += vehicleExpiryAttentionItems(
      {
        mot_expiry: v.mot_expiry,
        tax_expiry: v.tax_expiry,
        phv_licence_expiry: v.phv_licence_expiry,
      },
      notifySettings,
    ).length;
    if (n > 0) {
      attentionBySub.set(v.subcompany_id, (attentionBySub.get(v.subcompany_id) ?? 0) + n);
    }
  }

  return {
    ok: true,
    data: buildSubcompanyPortfolioPayload(
      subs.map((s) => ({
        id: s.id,
        name: s.name,
        isPrimary: s.isPrimary,
        vehicleCount: vehicleCountBySub.get(s.id) ?? 0,
        activeHireCount: activeHireCountBySub.get(s.id) ?? 0,
        attentionCount: attentionBySub.get(s.id) ?? 0,
      })),
    ),
  };
}
