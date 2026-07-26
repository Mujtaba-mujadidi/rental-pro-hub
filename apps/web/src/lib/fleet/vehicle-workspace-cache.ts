import { unstable_cache, revalidateTag } from "next/cache";
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

export type VehicleWorkspaceShellData = {
  vehicle: VehicleRow;
  documents: VehicleDocumentRow[];
  transfers: VehicleTransferRow[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
};

export type VehicleSwitcherOption = {
  id: string;
  vrm: string;
  make: string;
  model: string;
  status: VehicleStatus;
};

function vehicleWorkspaceTag(vehicleId: string) {
  return `vehicle-workspace:${vehicleId}`;
}

function vehicleSwitcherTag(companyId: string) {
  return `vehicle-switcher:${companyId}`;
}

async function fetchVehicleWorkspaceShellData(
  vehicleId: string,
  companyId: string,
): Promise<VehicleWorkspaceShellData | null> {
  const admin = createSupabaseAdminClient();
  const id = vehicleId.trim();
  const parentCompanyId = companyId.trim();
  if (!id || !parentCompanyId) return null;

  const [
    { data: vehicle, error: vErr },
    { data: docs, error: dErr },
    { data: transfers, error: tErr },
    { data: subs, error: sErr },
    { data: company },
  ] = await Promise.all([
    admin
      .from("vehicles")
      .select("*, subcompanies(name)")
      .eq("id", id)
      .eq("parent_company_id", parentCompanyId)
      .maybeSingle(),
    admin
      .from("vehicle_documents")
      .select("id, vehicle_id, doc_type, file_path, file_name, content_type, expiry_date, issued_date, notes, created_at")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("vehicle_transfers")
      .select("id, vehicle_id, from_subcompany_id, to_subcompany_id, transferred_at, notes")
      .eq("vehicle_id", id)
      .order("transferred_at", { ascending: false })
      .limit(20),
    admin
      .from("subcompanies")
      .select("id, name, is_primary")
      .eq("parent_company_id", parentCompanyId)
      .order("created_at", { ascending: true }),
    admin
      .from("companies")
      .select(
        "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before",
      )
      .eq("id", parentCompanyId)
      .maybeSingle(),
  ]);

  if (vErr || !vehicle || dErr || tErr || sErr) return null;

  const nested = vehicle.subcompanies as { name: string | null } | { name: string | null }[] | null;
  const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
  const { subcompanies: _s, ...rest } = vehicle as typeof vehicle & { subcompanies?: unknown };

  const nameById = new Map<string, string | null>();
  for (const s of subs ?? []) nameById.set(s.id, s.name);

  const notifySettings: CompanyNotificationSettings = parseCompanyNotificationSettings(company ?? undefined);

  return {
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
    })) as VehicleTransferRow[],
    subcompanies: (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    notifySettings,
  };
}

export function getCachedVehicleWorkspaceShellData(
  vehicleId: string,
  companyId: string,
): Promise<VehicleWorkspaceShellData | null> {
  const id = vehicleId.trim();
  const parentCompanyId = companyId.trim();
  if (!id || !parentCompanyId) return Promise.resolve(null);

  const cached = unstable_cache(
    () => fetchVehicleWorkspaceShellData(id, parentCompanyId),
    ["vehicle-workspace-shell", id, parentCompanyId],
    { revalidate: 30, tags: [vehicleWorkspaceTag(id), vehicleSwitcherTag(parentCompanyId)] },
  );
  return cached();
}

async function fetchVehicleSwitcherList(companyId: string): Promise<VehicleSwitcherOption[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vehicles")
    .select("id, vrm, make, model, status")
    .eq("parent_company_id", companyId)
    .order("vrm", { ascending: true });
  if (error) return [];

  return (data ?? []).map((v) => ({
    id: v.id,
    vrm: v.vrm,
    make: v.make,
    model: v.model,
    status: v.status as VehicleStatus,
  }));
}

export function getCachedVehicleSwitcherList(companyId: string): Promise<VehicleSwitcherOption[]> {
  const id = companyId.trim();
  if (!id) return Promise.resolve([]);

  const cached = unstable_cache(
    () => fetchVehicleSwitcherList(id),
    ["vehicle-switcher", id],
    { revalidate: 30, tags: [vehicleSwitcherTag(id)] },
  );
  return cached();
}

export function revalidateVehicleWorkspaceCache(vehicleId: string, companyId?: string | null) {
  const id = vehicleId.trim();
  if (id) revalidateTag(vehicleWorkspaceTag(id), { expire: 0 });
  const parentCompanyId = companyId?.trim();
  if (parentCompanyId) revalidateTag(vehicleSwitcherTag(parentCompanyId), { expire: 0 });
}
