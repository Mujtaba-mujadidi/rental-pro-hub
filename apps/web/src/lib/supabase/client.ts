import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey } = resolveSupabasePublishableEnv();
  return createBrowserClient(url, anonKey);
}
