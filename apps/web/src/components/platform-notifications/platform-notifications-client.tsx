"use client";

import { markPlatformNotificationReadAction } from "@/app/actions/platform-notifications";
import { formatUkDateTime } from "@/lib/datetime/uk";
import type { PlatformNotificationDisplay } from "@/lib/platform-notification-display";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Item = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  display: PlatformNotificationDisplay;
};

export function PlatformNotificationsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(item: Item) {
    startTransition(async () => {
      if (!item.readAt) await markPlatformNotificationReadAction(item.id);
      if (item.display.href) router.push(item.display.href);
      else router.refresh();
    });
  }

  if (!items.length) {
    return <p className="rph-muted text-sm">No notifications yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={pending}
            onClick={() => open(item)}
            className={`rph-card w-full p-4 text-left transition-colors hover:bg-rph-chrome/40 ${
              item.readAt ? "opacity-80" : "ring-1 ring-rph-rail/20"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-rph-fg">{item.display.title}</p>
                <p className="mt-1 text-sm text-rph-fg-secondary">{item.display.body}</p>
                <p className="rph-meta mt-2 text-xs">
                  {item.createdAt ? formatUkDateTime(item.createdAt) : ""}
                  {item.readAt ? " · Read" : " · Unread"}
                </p>
              </div>
              {item.display.href && item.display.actionLabel ? (
                <span className="rph-btn-primary inline-flex h-9 items-center px-3 text-xs">{item.display.actionLabel}</span>
              ) : item.display.href ? (
                <span className="rph-btn-ghost inline-flex h-9 items-center px-3 text-xs">Open</span>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
