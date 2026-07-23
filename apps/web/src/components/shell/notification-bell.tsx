"use client";

import {
  loadRecentPlatformNotificationsAction,
  markPlatformNotificationReadAction,
} from "@/app/actions/platform-notifications";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { usePlatformNotificationsRealtime } from "@/hooks/use-platform-notifications-realtime";
import type { PlatformNotificationDisplay } from "@/lib/platform-notification-display";
import { createClient } from "@/lib/supabase/client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type NotificationItem = {
  id: string;
  readAt: string | null;
  createdAt: string;
  display: PlatformNotificationDisplay;
};

type Props = {
  notificationsHref: string;
  initialUnreadCount: number;
  userId: string;
};

const menuContentClass =
  "z-[250] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg";

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

export function NotificationBell({ notificationsHref, initialUnreadCount, userId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const [pending, startTransition] = useTransition();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  const refreshUnreadCount = useCallback(async () => {
    const supabase = createClient();
    const { count, error } = await supabase
      .from("platform_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) return;
    setUnreadCount(count ?? 0);
  }, [userId]);

  const loadRecent = useCallback(() => {
    startTransition(async () => {
      const res = await loadRecentPlatformNotificationsAction(8);
      if (res.ok) setItems(res.items);
    });
  }, []);

  const syncNotifications = useCallback(() => {
    void refreshUnreadCount();
    if (openRef.current) loadRecent();
    router.refresh();
  }, [loadRecent, refreshUnreadCount, router]);

  usePlatformNotificationsRealtime(userId, syncNotifications);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (open) {
      loadRecent();
      void refreshUnreadCount();
    }
  }, [open, loadRecent, refreshUnreadCount]);

  function openNotification(item: NotificationItem) {
    startTransition(async () => {
      if (!item.readAt) {
        await markPlatformNotificationReadAction(item.id);
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setOpen(false);
      if (item.display.href) router.push(item.display.href);
      else router.push(notificationsHref);
      router.refresh();
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative rounded-lg p-2 text-rph-fg-secondary hover:bg-rph-chrome"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <IconBell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rph-rail px-0.5 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={8} collisionPadding={12} className={menuContentClass}>
          <div className="border-b border-rph-border px-3 py-2">
            <p className="text-sm font-semibold text-rph-fg">Notifications</p>
            <p className="text-xs text-rph-fg-muted">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're up to date"}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {pending && !items.length ? (
              <p className="px-3 py-4 text-sm text-rph-fg-muted" role="status">
                Loading…
              </p>
            ) : null}

            {!pending && !items.length ? (
              <p className="px-3 py-4 text-sm text-rph-fg-muted">No notifications yet.</p>
            ) : null}

            {items.map((item) => (
              <DropdownMenu.Item
                key={item.id}
                className="flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 text-left outline-none data-[highlighted]:bg-rph-chrome"
                onSelect={(event) => {
                  event.preventDefault();
                  openNotification(item);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${item.readAt ? "text-rph-fg-secondary" : "font-medium text-rph-fg"}`}>
                    {item.display.title}
                  </p>
                  {!item.readAt ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rph-rail" aria-hidden />
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs text-rph-fg-muted">{item.display.body}</p>
                {item.createdAt ? (
                  <p className="text-[10px] text-rph-fg-muted">{formatUkDateTime(item.createdAt)}</p>
                ) : null}
              </DropdownMenu.Item>
            ))}
          </div>

          <div className="border-t border-rph-border p-2">
            <Link
              href={notificationsHref}
              className="rph-btn-ghost flex h-9 w-full items-center justify-center text-xs"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
