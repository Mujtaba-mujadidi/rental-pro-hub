import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function unreadNotificationsTag(userId: string) {
  return `platform-notifications-unread:${userId}`;
}

export function getCachedUnreadNotificationCount(userId: string): Promise<number> {
  const id = userId.trim();
  if (!id) return Promise.resolve(0);

  const cached = unstable_cache(
    async () => {
      const admin = createSupabaseAdminClient();
      const { count, error } = await admin
        .from("platform_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id)
        .is("read_at", null)
        .is("deleted_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    ["platform-notifications-unread", id],
    { revalidate: 30, tags: [unreadNotificationsTag(id)] },
  );
  return cached();
}

export const getUnreadNotificationCountCached = cache((userId: string) =>
  getCachedUnreadNotificationCount(userId),
);

export function revalidateUnreadNotificationCount(userId: string | null | undefined) {
  const id = userId?.trim();
  if (!id) return;
  revalidateTag(unreadNotificationsTag(id), { expire: 0 });
}
