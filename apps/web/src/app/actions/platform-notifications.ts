"use server";

import { getSessionUser } from "@/lib/auth/profile";
import {
  mapPlatformNotificationListItems,
  type PlatformNotificationListItem,
} from "@/lib/platform-notification-inbox";
import { revalidateUnreadNotificationCount } from "@/lib/platform-notifications-read-cache";
import { createClient } from "@/lib/supabase/server";

const NOTIFICATION_SELECT = "id, type, payload, read_at, created_at";

function mapRows(
  rows: Array<{
    id: string;
    type: string;
    payload?: unknown;
    read_at?: string | null;
    created_at?: string | null;
  }>,
): PlatformNotificationListItem[] {
  return mapPlatformNotificationListItems(rows).items;
}

export async function loadRecentPlatformNotificationsAction(
  limit = 8,
): Promise<{ ok: true; items: PlatformNotificationListItem[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const capped = Math.min(Math.max(1, limit), 50);
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("platform_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) return { ok: false, error: error.message };

  return { ok: true, items: mapRows(rows ?? []) };
}

export async function loadPlatformNotificationsInboxAction(
  limit = 100,
): Promise<{ ok: true; items: PlatformNotificationListItem[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const capped = Math.min(Math.max(1, limit), 200);
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("platform_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) return { ok: false, error: error.message };

  return { ok: true, items: mapRows(rows ?? []) };
}

export async function markPlatformNotificationReadAction(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return markPlatformNotificationsReadAction([notificationId]);
}

export async function markPlatformNotificationsReadAction(
  notificationIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const ids = [...new Set(notificationIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "Notification not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidateUnreadNotificationCount(user.id);
  return { ok: true };
}

export async function markAllPlatformNotificationsReadAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidateUnreadNotificationCount(user.id);
  return { ok: true };
}

export async function dismissPlatformNotificationsAction(
  notificationIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const ids = [...new Set(notificationIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "Notification not found." };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ deleted_at: now, read_at: now })
    .in("id", ids)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidateUnreadNotificationCount(user.id);
  return { ok: true };
}
