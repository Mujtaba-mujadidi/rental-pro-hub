import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canDeleteFleet, canManageFleet } from "@/lib/auth/rental-permissions";
import {
  missingRequiredDocTypes,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import {
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncVehicleStatusForVehicle } from "@/lib/fleet/sync-vehicle-hire-status";
import { createClient } from "@/lib/supabase/server";

export type VehicleWorkspaceShell = {
  vehicle: VehicleRow;
  documents: VehicleDocumentRow[];
  transfers: VehicleTransferRow[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
};

export type VehicleWorkspaceShellResult =
  | ({ ok: true } & VehicleWorkspaceShell)
  | { ok: false; error: string };

async function loadCompanyNotifySettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
): Promise<CompanyNotificationSettings> {
  const { data } = await supabase
    .from("companies")
    .select(
      "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before",
    )
    .eq("id", parentCompanyId)
    .maybeSingle();
  return parseCompanyNotificationSettings(data ?? undefined);
}

async function fetchVehicleWorkspaceShell(vehicleId: string): Promise<VehicleWorkspaceShellResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  try {
    const admin = createSupabaseAdminClient();
    await syncVehicleStatusForVehicle(admin, id);
  } catch {
    /* fleet status repair is best-effort */
  }

  const supabase = await createClient();
  const [
    { data: vehicle, error: vErr },
    { data: docs, error: dErr },
    { data: transfers, error: tErr },
    { data: subs, error: sErr },
    notifySettings,
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*, subcompanies(name)")
      .eq("id", id)
      .eq("parent_company_id", parentCompanyId)
      .maybeSingle(),
    supabase
      .from("vehicle_documents")
      .select("id, vehicle_id, doc_type, file_path, file_name, content_type, expiry_date, issued_date, notes, created_at")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_transfers")
      .select("id, vehicle_id, from_subcompany_id, to_subcompany_id, transferred_at, notes")
      .eq("vehicle_id", id)
      .order("transferred_at", { ascending: false })
      .limit(20),
    supabase
      .from("subcompanies")
      .select("id, name, is_primary")
      .eq("parent_company_id", parentCompanyId)
      .order("created_at", { ascending: true }),
    loadCompanyNotifySettings(supabase, parentCompanyId),
  ]);

  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  if (dErr) return { ok: false, error: dErr.message };
  if (tErr) return { ok: false, error: tErr.message };
  if (sErr) return { ok: false, error: sErr.message };

  const nested = vehicle.subcompanies as { name: string | null } | { name: string | null }[] | null;
  const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
  const { subcompanies: _s, ...rest } = vehicle as typeof vehicle & { subcompanies?: unknown };

  const nameById = new Map<string, string | null>();
  for (const s of subs ?? []) nameById.set(s.id, s.name);

  return {
    ok: true,
    vehicle: {
      ...(rest as Omit<VehicleRow, "subcompany_name" | "missing_docs">),
      status: rest.status as VehicleStatus,
      mot_doc_attention_at: (rest as { mot_doc_attention_at?: string | null }).mot_doc_attention_at ?? null,
      phv_doc_attention_at: (rest as { phv_doc_attention_at?: string | null }).phv_doc_attention_at ?? null,
      subcompany_name: subName ?? null,
      missing_docs: missingRequiredDocTypes((docs ?? []).map((d) => d.doc_type)),
    },
    documents: (docs ?? []) as VehicleDocumentRow[],
    transfers: (transfers ?? []).map((t) => ({
      ...t,
      from_name: nameById.get(t.from_subcompany_id) ?? null,
      to_name: nameById.get(t.to_subcompany_id) ?? null,
    })),
    subcompanies: (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    notifySettings,
    canManage: canManageFleet(profile),
    canDelete: canDeleteFleet(profile),
  };
}

/** Deduped per server request (layout + any server child calling the same vehicle). */
export const getVehicleWorkspaceShell = cache(fetchVehicleWorkspaceShell);
