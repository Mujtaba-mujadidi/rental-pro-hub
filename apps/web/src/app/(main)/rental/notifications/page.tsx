import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { mapPlatformNotificationListItems } from "@/lib/platform-notification-inbox";
import { RentalNotificationsClient } from "./rental-notifications-client";

export default async function RentalNotificationsPage() {
  const { profile } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", profile.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const items = mapPlatformNotificationListItems(rows ?? []).items;

  return <RentalNotificationsClient items={items} />;
}
