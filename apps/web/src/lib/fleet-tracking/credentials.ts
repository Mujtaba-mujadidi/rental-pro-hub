import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptFleetTrackingPassword } from "@/lib/fleet-tracking/crypto";
import {
  clearAccessTokenCache,
  getAccessToken,
  type ProtrackDebugPayload,
} from "@/lib/fleet-tracking/protrack-client";

export type CompanyFleetTrackingRow = {
  id: string;
  fleet_tracking_enabled: boolean;
  fleet_tracking_account: string | null;
  fleet_tracking_password_encrypted: string | null;
};

/** Public flag check — safe for user-scoped client (no password column). */
export async function isFleetTrackingEnabled(companyId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("fleet_tracking_enabled")
    .eq("id", companyId)
    .maybeSingle();
  return Boolean(data?.fleet_tracking_enabled);
}

/** Loads credentials via service role so encrypted passwords are not exposed over user RLS. */
export async function loadCompanyFleetTracking(
  companyId: string,
): Promise<CompanyFleetTrackingRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select("id, fleet_tracking_enabled, fleet_tracking_account, fleet_tracking_password_encrypted")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CompanyFleetTrackingRow;
}

export async function getCompanyAccessToken(
  companyId: string,
): Promise<
  | { ok: true; token: string; account: string; debug?: ProtrackDebugPayload }
  | { ok: false; error: string; debug?: ProtrackDebugPayload }
> {
  const row = await loadCompanyFleetTracking(companyId);
  if (!row?.fleet_tracking_enabled) {
    return { ok: false, error: "Fleet Tracking is not enabled for this company." };
  }
  const account = row.fleet_tracking_account?.trim();
  if (!account || !row.fleet_tracking_password_encrypted) {
    return { ok: false, error: "Add your SmartCar Tracker API account and password in Fleet Tracking settings." };
  }
  let password: string;
  try {
    password = decryptFleetTrackingPassword(row.fleet_tracking_password_encrypted);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not decrypt stored API password.",
    };
  }
  const tokenRes = await getAccessToken(account, password, companyId);
  if (!tokenRes.ok) {
    clearAccessTokenCache(companyId);
    return { ok: false, error: tokenRes.error, debug: tokenRes.debug };
  }
  return { ok: true, token: tokenRes.data, account, debug: tokenRes.debug };
}
