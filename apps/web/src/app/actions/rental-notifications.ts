"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { markPlatformNotificationReadAction } from "@/app/actions/platform-notifications";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRentalCompanyArea();
  return markPlatformNotificationReadAction(notificationId);
}

export async function countUnreadNotificationsAction(): Promise<number> {
  const { profile } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("platform_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
