"use server";

import { getSessionUser } from "@/lib/auth/profile";
import { formatPlatformNotification } from "@/lib/platform-notification-display";
import { createClient } from "@/lib/supabase/server";

export type PlatformNotificationListItem = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  display: ReturnType<typeof formatPlatformNotification>;
};

export async function loadRecentPlatformNotificationsAction(
  limit = 8,
): Promise<{ ok: true; items: PlatformNotificationListItem[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const capped = Math.min(Math.max(1, limit), 50);
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) return { ok: false, error: error.message };

  const items = (rows ?? []).map((n) => ({
    id: n.id as string,
    type: n.type as string,
    readAt: (n.read_at as string | null) ?? null,
    createdAt: (n.created_at as string) ?? "",
    display: formatPlatformNotification(n.type as string, (n.payload ?? {}) as Record<string, unknown>),
  }));

  return { ok: true, items };
}

export async function markPlatformNotificationReadAction(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const id = notificationId.trim();
  if (!id) return { ok: false, error: "Notification not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
