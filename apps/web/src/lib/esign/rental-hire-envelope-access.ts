import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import type { AppProfile } from "@/lib/auth/profile";
import { VEHICLE_HIRE_AGREEMENT_CONTEXT } from "@/lib/esign/adapters/vehicle-hire-agreement";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function hireEnvelopeCompanyMatch(
  admin: Admin,
  profile: AppProfile,
  envelopeId: string,
): Promise<boolean> {
  const companyId = profile.company_id?.trim();
  if (!companyId || profile.role !== "rental_company") return false;

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("parent_company_id, context_type")
    .eq("id", envelopeId.trim())
    .maybeSingle();

  return (
    env?.parent_company_id === companyId && env?.context_type === VEHICLE_HIRE_AGREEMENT_CONTEXT
  );
}

export async function rentalStaffCanAccessHireEnvelope(
  admin: Admin,
  profile: AppProfile,
  envelopeId: string,
): Promise<boolean> {
  if (!canWriteRentals(profile)) return false;
  return hireEnvelopeCompanyMatch(admin, profile, envelopeId);
}

export async function rentalStaffCanReadHireEnvelope(
  admin: Admin,
  profile: AppProfile,
  envelopeId: string,
): Promise<boolean> {
  if (!canReadRentals(profile)) return false;
  return hireEnvelopeCompanyMatch(admin, profile, envelopeId);
}

export async function driverCanAccessHireEnvelope(
  admin: Admin,
  driverUserId: string,
  envelopeId: string,
): Promise<boolean> {
  const userId = driverUserId.trim();
  const envId = envelopeId.trim();
  if (!userId || !envId) return false;

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("context_type, context_id")
    .eq("id", envId)
    .maybeSingle();
  if (!env?.context_id || env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) return false;

  const { data: agreement } = await admin
    .from("vehicle_hire_agreements")
    .select("hire_group_id, vehicle_hire_groups(driver_user_id)")
    .eq("id", env.context_id)
    .maybeSingle();
  if (!agreement?.hire_group_id) return false;

  const driverId = (
    agreement as { vehicle_hire_groups?: { driver_user_id?: string } | null }
  ).vehicle_hire_groups?.driver_user_id;

  return driverId === userId;
}
