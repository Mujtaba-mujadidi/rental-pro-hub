import { unstable_cache, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";

export type HireWorkspaceShellData = {
  hireGroupId: string;
  status: HireGroupStatus;
  vehicleId: string;
  vehicleVrm: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  driverEmail: string | null;
  driverLicenceNumber: string | null;
  startDate: string;
  rentAmountGbp: number | null;
  rentCadence: string | null;
};

export type HireSwitcherOption = {
  id: string;
  vehicleVrm: string;
  driverLabel: string | null;
  status: string;
};

function hireWorkspaceTag(groupId: string) {
  return `hire-workspace:${groupId}`;
}

function hireSwitcherTag(companyId: string) {
  return `hire-switcher:${companyId}`;
}

async function fetchHireWorkspaceShellData(
  groupId: string,
  companyId: string,
): Promise<HireWorkspaceShellData | null> {
  const admin = createSupabaseAdminClient();
  const id = groupId.trim();
  const parentCompanyId = companyId.trim();
  if (!id || !parentCompanyId) return null;

  const { data, error } = await admin
    .from("vehicle_hire_groups")
    .select(
      "id, status, start_date, rent_cadence, rent_amount_gbp, vehicle_id, driver_email, driver_licence_number, vehicles(vrm, make, model)",
    )
    .eq("id", id)
    .eq("parent_company_id", parentCompanyId)
    .maybeSingle();
  if (error || !data) return null;

  const vehicle = data.vehicles as { vrm?: string; make?: string; model?: string } | null;

  return {
    hireGroupId: data.id as string,
    status: data.status as HireGroupStatus,
    vehicleId: data.vehicle_id as string,
    vehicleVrm: vehicle?.vrm?.trim() || "—",
    vehicleMake: vehicle?.make?.trim() || null,
    vehicleModel: vehicle?.model?.trim() || null,
    driverEmail: (data.driver_email as string | null)?.trim() || null,
    driverLicenceNumber: (data.driver_licence_number as string | null)?.trim() || null,
    startDate: data.start_date as string,
    rentAmountGbp: (data.rent_amount_gbp as number | null) ?? null,
    rentCadence: (data.rent_cadence as string | null) ?? null,
  };
}

export function getCachedHireWorkspaceShellData(
  groupId: string,
  companyId: string,
): Promise<HireWorkspaceShellData | null> {
  const id = groupId.trim();
  const parentCompanyId = companyId.trim();
  if (!id || !parentCompanyId) return Promise.resolve(null);

  const cached = unstable_cache(
    () => fetchHireWorkspaceShellData(id, parentCompanyId),
    ["hire-workspace-shell", id, parentCompanyId],
    { revalidate: 30, tags: [hireWorkspaceTag(id), hireSwitcherTag(parentCompanyId)] },
  );
  return cached();
}

async function fetchHireSwitcherList(companyId: string): Promise<HireSwitcherOption[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, driver_email, driver_licence_number, vehicles(vrm)")
    .eq("parent_company_id", companyId)
    .not("status", "eq", "draft")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id as string,
    vehicleVrm: (row.vehicles as { vrm?: string } | null)?.vrm?.trim() || "—",
    driverLabel:
      (row.driver_email as string | null)?.trim() ||
      (row.driver_licence_number as string | null)?.trim() ||
      null,
    status: row.status as string,
  }));
}

export function getCachedHireSwitcherList(companyId: string): Promise<HireSwitcherOption[]> {
  const id = companyId.trim();
  if (!id) return Promise.resolve([]);

  const cached = unstable_cache(
    () => fetchHireSwitcherList(id),
    ["hire-switcher", id],
    { revalidate: 30, tags: [hireSwitcherTag(id)] },
  );
  return cached();
}

export function revalidateHireWorkspaceCache(groupId?: string | null, companyId?: string | null) {
  const id = groupId?.trim();
  if (id) revalidateTag(hireWorkspaceTag(id), { expire: 0 });
  const parentCompanyId = companyId?.trim();
  if (parentCompanyId) revalidateTag(hireSwitcherTag(parentCompanyId), { expire: 0 });
}
