import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";

/** One Supabase server client per React request (layout + page share it). */
export const createClient = cache(async () => {
  const { url, anonKey } = resolveSupabasePublishableEnv();

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* ignore when called from Server Components */
        }
      },
    },
  });
});
