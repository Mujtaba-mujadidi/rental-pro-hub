import type { AppProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/** Shown when `deletion_phase` is offboarding or access_blocked. */
export const RENTAL_COMPANY_DATA_FROZEN_MESSAGE =
  "This organisation is offboarding or closed—editing data is disabled. If you are in the retention period, use the offboarding page to download your data export.";

export function isRentalCompanyWriteFrozenPhase(phase: string | null | undefined): boolean {
  return phase === "offboarding" || phase === "access_blocked";
}

/**
 * Blocks server-side mutations while the tenant is in offboarding or access_blocked.
 * Call at the start of every server action that creates/updates/deletes rental tenant data
 * (immediately after `requireRentalCompanyArea()`).
 *
 * Currently wired in: rental-profile, rental-onboarding, rental-company-contract (request change),
 * rental-billing, rental-staff, rental-subcompanies, rental-vehicles. Add the same two lines to any new
 * rental `use server` action that mutates data.
 */
export async function assertRentalCompanyWritable(
  profile: AppProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (profile.role !== "rental_company") {
    return { ok: false, error: "Not a rental company session." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) {
    return { ok: false, error: "No active company in your profile." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("companies")
    .select("deletion_phase")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  const phase = (row?.deletion_phase as string) ?? "active";
  if (isRentalCompanyWriteFrozenPhase(phase)) {
    return { ok: false, error: RENTAL_COMPANY_DATA_FROZEN_MESSAGE };
  }

  return { ok: true };
}
