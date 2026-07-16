import { createClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";

/**
 * Read server secrets at runtime (dynamic key access).
 * Static `process.env.SUPABASE_SERVICE_ROLE_KEY` can be inlined as `undefined`
 * at build time on hosts like Railway if the var was missing during that build.
 */
function readServerEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

/**
 * Service-role client (bypasses RLS). Server-only — never import into client components.
 */
export function createSupabaseAdminClient() {
  const { url } = resolveSupabasePublishableEnv();
  const serviceRole =
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY");

  if (!serviceRole) {
    const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
    throw new Error(
      onRailway
        ? "Missing SUPABASE_SERVICE_ROLE_KEY on Railway. Add it under Variables (exact name), then Redeploy (full rebuild). Do not use the anon key."
        : "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to apps/web/.env.local (Supabase Dashboard → Settings → API → service_role), then restart Next.",
    );
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
