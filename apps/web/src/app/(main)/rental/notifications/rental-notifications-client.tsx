"use client";

import { PlatformNotificationsClient } from "@/components/platform-notifications/platform-notifications-client";
import type { PlatformNotificationDisplay } from "@/lib/platform-notification-display";

type Item = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  display: PlatformNotificationDisplay;
};

export function RentalNotificationsClient({ items }: { items: Item[] }) {
  return <PlatformNotificationsClient items={items} />;
}
