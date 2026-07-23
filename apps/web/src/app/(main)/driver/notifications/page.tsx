import { getSessionUser } from "@/lib/auth/profile";
import { formatPlatformNotification } from "@/lib/platform-notification-display";
import { createClient } from "@/lib/supabase/server";
import { PlatformNotificationsClient } from "@/components/platform-notifications/platform-notifications-client";
import { redirect } from "next/navigation";

export default async function DriverNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", user.id)
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
        Payment approvals, hire updates, and other messages about your vehicle hire.
      </p>
      <PlatformNotificationsClient items={items} />
    </div>
  );
}
