import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { formatPlatformNotification } from "@/lib/platform-notification-display";
import { createClient } from "@/lib/supabase/server";
import { RentalNotificationsClient } from "./rental-notifications-client";

export default async function RentalNotificationsPage() {
  const { profile } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const items = (rows ?? []).map((n) => ({
    id: n.id as string,
    type: n.type as string,
    readAt: (n.read_at as string | null) ?? null,
    createdAt: (n.created_at as string) ?? "",
    display: formatPlatformNotification(n.type as string, (n.payload ?? {}) as Record<string, unknown>),
  }));

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Notifications</h1>
      <p className="rph-muted max-w-2xl text-sm">
        Hire payments, contracts, and billing events. Open an item to mark it read and go to the relevant page.
      </p>
      <RentalNotificationsClient items={items} />
    </div>
  );
}
