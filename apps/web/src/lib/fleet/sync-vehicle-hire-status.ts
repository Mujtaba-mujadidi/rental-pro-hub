import { vehicleStatusForHireGroup, allAgreementsSigned, isStartDateInFuture } from "@/lib/fleet/hire-lifecycle";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { HIRE_VEHICLE_BLOCKING_STATUSES, type HireGroupStatus } from "@/lib/fleet/hire-types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export function vehicleIdsBlockedByInProgressHires(
  hires: { id: string; vehicle_id: string | null }[],
  exceptHireGroupId?: string | null,
): Set<string> {
  const blocked = new Set<string>();
  for (const hire of hires) {
    if (exceptHireGroupId && hire.id === exceptHireGroupId) continue;
    if (hire.vehicle_id) blocked.add(hire.vehicle_id);
  }
  return blocked;
}

export async function getBlockingHireForVehicle(
  admin: Admin,
  vehicleId: string,
  exceptHireGroupId?: string | null,
): Promise<{ id: string; status: HireGroupStatus } | null> {
  const { data } = await admin
    .from("vehicle_hire_groups")
    .select("id, status")
    .eq("vehicle_id", vehicleId)
    .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES])
    .limit(5);
  const row = (data ?? []).find((r) => r.id !== exceptHireGroupId);
  if (!row) return null;
  return { id: row.id as string, status: row.status as HireGroupStatus };
}

export async function assertVehicleAvailableForHire(
  admin: Admin,
  vehicleId: string,
  exceptHireGroupId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conflict = await getBlockingHireForVehicle(admin, vehicleId, exceptHireGroupId);
  if (conflict) {
    return {
      ok: false,
      error: "This vehicle is already tied to another hire contract in progress.",
    };
  }
  return { ok: true };
}

export async function releaseVehicleIfNoBlockingHire(
  admin: Admin,
  vehicleId: string,
  exceptHireGroupId?: string | null,
): Promise<void> {
  const conflict = await getBlockingHireForVehicle(admin, vehicleId, exceptHireGroupId);
  if (conflict) return;

  const { data: vehicle } = await admin.from("vehicles").select("status").eq("id", vehicleId).maybeSingle();
  if (vehicle?.status === "reserved") {
    await admin.from("vehicles").update({ status: "available" }).eq("id", vehicleId);
  }
}

/** Move a fully signed hire from `reserved` to `active` once the UK start date is reached. */
async function promoteDueHireGroupToActive(admin: Admin, hireGroupId: string): Promise<void> {
  const today = ukTodayYmd();
  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, start_date")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group?.id || group.status !== "reserved") return;
  if (isStartDateInFuture(group.start_date as string, today)) return;

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("signed_at, status")
    .eq("hire_group_id", hireGroupId);
  const signedFlags = (agreements ?? []).map(
    (a) => Boolean(a.signed_at) || a.status === "reserved" || a.status === "active",
  );
  if (!allAgreementsSigned(signedFlags)) return;

  const now = new Date().toISOString();
  await admin
    .from("vehicle_hire_groups")
    .update({ status: "active", activated_at: now })
    .eq("id", hireGroupId);
}

export async function syncVehicleStatusForHireGroup(admin: Admin, hireGroupId: string): Promise<void> {
  await promoteDueHireGroupToActive(admin, hireGroupId);

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, vehicle_id, status")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group?.vehicle_id) return;

  const vehicleId = group.vehicle_id as string;
  const status = group.status as HireGroupStatus;

  if (status === "cancelled" || status === "completed" || status === "terminated") {
    await releaseVehicleIfNoBlockingHire(admin, vehicleId, hireGroupId);
    return;
  }

  const next = vehicleStatusForHireGroup(status);
  if (next) {
    await admin.from("vehicles").update({ status: next }).eq("id", vehicleId);
  }
}

/** Re-apply fleet status for all vehicles tied to in-progress hires (repairs drift). */
export async function reconcileBlockingHireVehicleStatusesForCompany(
  admin: Admin,
  companyId: string,
): Promise<void> {
  const { data: hires } = await admin
    .from("vehicle_hire_groups")
    .select("id")
    .eq("parent_company_id", companyId)
    .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES])
    .not("vehicle_id", "is", null);

  for (const hire of hires ?? []) {
    await syncVehicleStatusForHireGroup(admin, hire.id as string);
  }
}

/** Re-apply fleet status when a single vehicle may be tied to a blocking hire. */
export async function syncVehicleStatusForVehicle(admin: Admin, vehicleId: string): Promise<void> {
  const { data: hires } = await admin
    .from("vehicle_hire_groups")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .in("status", [...HIRE_VEHICLE_BLOCKING_STATUSES]);

  for (const hire of hires ?? []) {
    await syncVehicleStatusForHireGroup(admin, hire.id as string);
  }
}
