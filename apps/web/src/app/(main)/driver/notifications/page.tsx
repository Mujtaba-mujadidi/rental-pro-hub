import { getSessionUser } from "@/lib/auth/profile";
import { mapPlatformNotificationListItems } from "@/lib/platform-notification-inbox";
import { PlatformNotificationsClient } from "@/components/platform-notifications/platform-notifications-client";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DriverNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const items = mapPlatformNotificationListItems(rows ?? []).items;

  return <PlatformNotificationsClient items={items} audience="driver" />;
}
