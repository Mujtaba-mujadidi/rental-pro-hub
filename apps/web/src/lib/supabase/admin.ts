import { createClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";

/**
 * Service-role client (bypasses RLS). Server-only — never import into client components.
 */
export function createSupabaseAdminClient() {
  const { url } = resolveSupabasePublishableEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRole) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (Supabase Dashboard → Settings → API → service_role).",
    );
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
