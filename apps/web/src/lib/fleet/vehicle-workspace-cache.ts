import { unstable_cache, revalidateTag } from "next/cache";
import { HIRE_VEHICLE_BLOCKING_STATUSES, type HireGroupStatus } from "@/lib/fleet/hire-types";
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
import {
  mapVehicleTransferOpenRequirements,
  type VehicleTransferOpenRequirement,
} from "@/lib/fleet/vehicle-transfer-document-requirements";
import type { VehicleWorkspaceOpenHire } from "@/lib/fleet/vehicle-workspace-shell-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type VehicleWorkspaceShellData = {
  vehicle: VehicleRow;
  documents: VehicleDocumentRow[];
  documentHistory: VehicleDocumentRow[];
  transfers: VehicleTransferRow[];
  transferDocumentRequirements: VehicleTransferOpenRequirement[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
  currentOpenHire: VehicleWorkspaceOpenHire | null;
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

function isMissingVehicleDocVersionStatusColumn(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("version_status") && message.includes("column");
}

async function loadVehicleWorkspaceDocuments(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  vehicleId: string,
  versionStatus: "current" | "superseded" = "current",
): Promise<{ docs: VehicleDocumentRow[]; error: string | null }> {
  const baseSelect =
    "id, vehicle_id, doc_type, file_path, file_name, content_type, expiry_date, issued_date, notes, created_at";

  const versioned = await admin
    .from("vehicle_documents")
    .select(`${baseSelect}, version_status, supersedes_document_id, vehicle_transfer_id`)
    .eq("vehicle_id", vehicleId)
    .eq("version_status", versionStatus)
    .order("created_at", { ascending: false });

  if (!versioned.error) {
    return { docs: (versioned.data ?? []) as VehicleDocumentRow[], error: null };
  }

  if (!isMissingVehicleDocVersionStatusColumn(versioned.error)) {
    return { docs: [], error: versioned.error.message };
  }

  const legacy = await admin
    .from("vehicle_documents")
    .select(baseSelect)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (legacy.error) return { docs: [], error: legacy.error.message };
  return { docs: (legacy.data ?? []) as VehicleDocumentRow[], error: null };
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
    docResult,
    historicDocResult,
    { data: transfers, error: tErr },
    { data: transferRequirements, error: trErr },
    { data: subs, error: sErr },
    { data: company },
    { data: openHire },
  ] = await Promise.all([
    admin
      .from("vehicles")
      .select("*, subcompanies(name)")
      .eq("id", id)
      .eq("parent_company_id", parentCompanyId)
      .maybeSingle(),
    loadVehicleWorkspaceDocuments(admin, id),
    loadVehicleWorkspaceDocuments(admin, id, "superseded"),
    admin
      .from("vehicle_transfers")
      .select("id, vehicle_id, from_subcompany_id, to_subcompany_id, transferred_at, notes")
      .eq("vehicle_id", id)
      .order("transferred_at", { ascending: false })
      .limit(100),
    admin
      .from("vehicle_transfer_document_requirements")
      .select("id, document_kind, vehicle_transfer_id, hire_group_id, agreement_id, inspection_id")
      .eq("vehicle_id", id)
      .eq("status", "required")
      .order("created_at", { ascending: false }),
    admin
      .from("subcompanies")
      .select("id, name, is_primary")
      .eq("parent_company_id", parentCompanyId)
      .order("created_at", { ascending: true }),
    admin
      .from("companies")
      .select(
        "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
      )
      .eq("id", parentCompanyId)
      .maybeSingle(),
    admin
      .from("vehicle_hire_groups")
      .select("id, status")
      .eq("vehicle_id", id)
      .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const docs = docResult.docs;
  const dErr = docResult.error;
  const historicDocs = historicDocResult.docs;

  if (vErr || !vehicle) return null;
  if (dErr) {
    console.error("vehicle workspace documents query failed", id, dErr);
  }
  if (tErr) {
    console.error("vehicle workspace transfers query failed", id, tErr.message);
  }
  if (trErr) {
    console.error("vehicle workspace transfer document requirements query failed", id, trErr.message);
  }
  if (sErr) {
    console.error("vehicle workspace subcompanies query failed", parentCompanyId, sErr.message);
  }

  const nested = vehicle.subcompanies as { name: string | null } | { name: string | null }[] | null;
  const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
  const { subcompanies: _s, ...rest } = vehicle as typeof vehicle & { subcompanies?: unknown };

  const nameById = new Map<string, string | null>();
  for (const s of subs ?? []) nameById.set(s.id, s.name);

  const notifySettings: CompanyNotificationSettings = parseCompanyNotificationSettings(company ?? undefined);

  const currentOpenHire: VehicleWorkspaceOpenHire | null = openHire?.id
    ? { id: openHire.id as string, status: openHire.status as HireGroupStatus }
    : null;

  return {
    vehicle: {
      ...(rest as Omit<VehicleRow, "subcompany_name" | "missing_docs">),
      status: rest.status as VehicleStatus,
      mot_doc_attention_at: (rest as { mot_doc_attention_at?: string | null }).mot_doc_attention_at ?? null,
      phv_doc_attention_at: (rest as { phv_doc_attention_at?: string | null }).phv_doc_attention_at ?? null,
      archived_at: (rest as { archived_at?: string | null }).archived_at ?? null,
      subcompany_name: subName ?? null,
      missing_docs: missingRequiredDocTypes((docs ?? []).map((d) => d.doc_type)),
    },
    documents: (docs ?? []) as VehicleDocumentRow[],
    documentHistory: (historicDocs ?? []) as VehicleDocumentRow[],
    transfers: (transfers ?? []).map((t) => ({
      ...t,
      from_name: nameById.get(t.from_subcompany_id) ?? null,
      to_name: nameById.get(t.to_subcompany_id) ?? null,
    })) as VehicleTransferRow[],
    transferDocumentRequirements: mapVehicleTransferOpenRequirements(transferRequirements ?? []),
    subcompanies: (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    notifySettings,
    currentOpenHire,
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
    ["vehicle-workspace-shell-v5", id, parentCompanyId],
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
    .is("archived_at", null)
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
