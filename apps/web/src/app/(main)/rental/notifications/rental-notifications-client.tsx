"use client";

import { PlatformNotificationsClient } from "@/components/platform-notifications/platform-notifications-client";
import type { PlatformNotificationListItem } from "@/lib/platform-notification-inbox";

export function RentalNotificationsClient({ items }: { items: PlatformNotificationListItem[] }) {
  return <PlatformNotificationsClient items={items} audience="staff" />;
}
