"use client";

import {
  dismissPlatformNotificationsAction,
  markAllPlatformNotificationsReadAction,
  markPlatformNotificationsReadAction,
} from "@/app/actions/platform-notifications";
import {
  buildPlatformNotificationInboxRows,
  filterPlatformNotificationInboxRows,
  formatPlatformNotificationInboxTime,
  PLATFORM_NOTIFICATION_INBOX_FILTERS,
  type PlatformNotificationInboxFilter,
  type PlatformNotificationInboxRow,
  type PlatformNotificationListItem,
} from "@/lib/platform-notification-inbox";
import type { PlatformNotificationTone } from "@/lib/platform-notification-display";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const rowActionTriggerClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised text-rph-fg-secondary transition-colors hover:bg-rph-chrome data-[state=open]:bg-rph-chrome disabled:opacity-50";
const rowActionContentClass =
  "z-[200] min-w-[10.5rem] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";
const rowActionItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-rph-chrome";
const rowActionDeleteClass = `${rowActionItemClass} text-red-600 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:text-red-300`;

function toneClass(tone: PlatformNotificationTone): string {
  if (tone === "success") return "rph-notifications-icon-success";
  if (tone === "warn") return "rph-notifications-icon-warn";
  return "rph-notifications-icon-info";
}

function ToneIcon({ tone }: { tone: PlatformNotificationTone }) {
  if (tone === "success") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === "warn") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
        <path d="M12 7v7" strokeLinecap="round" />
        <circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M12 11v6" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlatformNotificationsClient({
  items,
  audience = "staff",
}: {
  items: PlatformNotificationListItem[];
  audience?: "staff" | "driver";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<PlatformNotificationInboxFilter>("all");
  const [rows, setRows] = useState(() =>
    buildPlatformNotificationInboxRows(items, Object.fromEntries(items.map((item) => [item.id, item.payloadHireGroupId]))),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(
      buildPlatformNotificationInboxRows(
        items,
        Object.fromEntries(items.map((item) => [item.id, item.payloadHireGroupId])),
      ),
    );
  }, [items]);

  const visible = useMemo(() => filterPlatformNotificationInboxRows(rows, filter), [filter, rows]);
  const unreadCount = rows.filter((row) => row.unread).length;
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function fillToPageEnd() {
      const page = pageRef.current;
      if (!page) return;
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!desktop) {
        page.style.height = "";
        page.style.maxHeight = "";
        return;
      }
      const footer = page.closest("body")?.querySelector("footer");
      const footerHeight = footer?.getBoundingClientRect().height ?? 48;
      const main = page.closest("main");
      const mainPaddingBottom = main ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 16 : 16;
      const top = page.getBoundingClientRect().top;
      const height = `${Math.max(320, window.innerHeight - top - footerHeight - mainPaddingBottom)}px`;
      page.style.height = height;
      page.style.maxHeight = height;
    }

    fillToPageEnd();
    window.addEventListener("resize", fillToPageEnd);
    return () => window.removeEventListener("resize", fillToPageEnd);
  }, [error]);

  function open(row: PlatformNotificationInboxRow) {
    if (row.display.href) router.push(row.display.href);
    if (!row.unread) return;
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, unread: false, readAt: new Date().toISOString() } : item)),
    );
    startTransition(async () => {
      const res = await markPlatformNotificationsReadAction(row.ids);
      if (!res.ok) setError(res.error);
    });
  }

  function markAllRead() {
    setError(null);
    setRows((current) =>
      current.map((item) => (item.unread ? { ...item, unread: false, readAt: new Date().toISOString() } : item)),
    );
    startTransition(async () => {
      const res = await markAllPlatformNotificationsReadAction();
      if (!res.ok) setError(res.error);
    });
  }

  function dismiss(row: PlatformNotificationInboxRow) {
    setError(null);
    setRows((current) => current.filter((item) => item.id !== row.id));
    startTransition(async () => {
      const res = await dismissPlatformNotificationsAction(row.ids);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div ref={pageRef} className="rph-notifications-page">
      <header className="rph-notifications-header">
        <h1 className="rph-h1">Notifications</h1>
        <p className="rph-muted mt-1 max-w-2xl text-sm">
          {audience === "driver"
            ? "Payment and hire updates, grouped by outcome rather than a single event."
            : "Prioritised company updates, grouped by outcome rather than a single event."}
        </p>
      </header>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="rph-notifications-layout">
        <aside className="rph-notifications-options">
          <button
            type="button"
            className="rph-notifications-mark-all"
            disabled={pending || unreadCount === 0}
            onClick={markAllRead}
          >
            Mark all as read
          </button>
          <nav className="rph-notifications-nav" aria-label="Notification groups">
            {PLATFORM_NOTIFICATION_INBOX_FILTERS.map((item) => {
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={active ? "rph-notifications-nav-item rph-notifications-nav-item-active" : "rph-notifications-nav-item"}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="rph-notifications-list-card" aria-label="Notifications">
          <div className="rph-notifications-list" role="list">
            {!visible.length ? (
              <p className="px-5 py-10 text-sm text-rph-fg-muted">
                {filter === "unread"
                  ? "You're up to date — no unread notifications."
                  : filter === "all"
                    ? "No notifications yet."
                    : `No ${PLATFORM_NOTIFICATION_INBOX_FILTERS.find((item) => item.value === filter)?.label.toLowerCase() ?? filter} notifications.`}
              </p>
            ) : (
              visible.map((row) => (
                <div key={row.id} className="rph-notifications-row" role="listitem">
                  <span className={`rph-notifications-icon ${toneClass(row.tone)}`}>
                    <ToneIcon tone={row.tone} />
                  </span>
                  <button type="button" className="rph-notifications-body" onClick={() => open(row)}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-rph-fg">{row.display.title}</span>
                      {row.unread ? <span className="rph-notifications-new">New</span> : null}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-rph-fg-secondary">{row.display.body}</span>
                    <span className="rph-notifications-time">{formatPlatformNotificationInboxTime(row.createdAt)}</span>
                  </button>
                  <NotificationRowActions
                    canOpen={Boolean(row.display.href)}
                    disabled={pending}
                    onOpen={() => open(row)}
                    onDelete={() => dismiss(row)}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function NotificationRowActions({
  canOpen,
  disabled,
  onOpen,
  onDelete,
}: {
  canOpen: boolean;
  disabled: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={rowActionTriggerClass} disabled={disabled} aria-label="Notification actions" title="Actions">
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={rowActionContentClass}>
          <DropdownMenu.Item className={rowActionItemClass} disabled={!canOpen} onSelect={onOpen}>
            Open
          </DropdownMenu.Item>
          <DropdownMenu.Item className={rowActionDeleteClass} onSelect={onDelete}>
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}
