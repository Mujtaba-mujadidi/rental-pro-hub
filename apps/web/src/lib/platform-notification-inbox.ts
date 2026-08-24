import { formatUkDateTimeText, formatUkTime, ukLondonDayYmd, ukTodayYmd } from "@/lib/datetime/uk";
import {
  formatPlatformNotification,
  platformNotificationGroups,
  platformNotificationTone,
  type PlatformNotificationDisplay,
  type PlatformNotificationGroup,
  type PlatformNotificationTone,
} from "@/lib/platform-notification-display";

export type PlatformNotificationInboxFilter =
  | "all"
  | "unread"
  | PlatformNotificationGroup;

export type PlatformNotificationListItem = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  display: PlatformNotificationDisplay;
  payloadHireGroupId?: string | null;
};

export type PlatformNotificationInboxRow = {
  id: string;
  ids: string[];
  type: string;
  readAt: string | null;
  createdAt: string;
  unread: boolean;
  groups: PlatformNotificationGroup[];
  tone: PlatformNotificationTone;
  display: PlatformNotificationDisplay;
  groupedCount: number;
};

export const PLATFORM_NOTIFICATION_INBOX_FILTERS: Array<{
  value: PlatformNotificationInboxFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "payments", label: "Payments" },
  { value: "documents", label: "Documents" },
  { value: "compliance", label: "Compliance" },
];

export function platformNotificationGroupingKey(item: {
  id: string;
  type: string;
  display: Pick<PlatformNotificationDisplay, "href">;
  payloadHireGroupId?: string | null;
}): string {
  const hireGroupId = item.payloadHireGroupId?.trim();
  if (hireGroupId && item.type.startsWith("hire_payment_")) {
    return `hire-payment:${hireGroupId}`;
  }
  if (hireGroupId && (item.type === "hire_insurance_expiry" || item.type === "hire_contract_expiry")) {
    return `${item.type}:${hireGroupId}`;
  }
  const href = item.display.href?.trim();
  if (href && item.type.startsWith("hire_payment_")) return `hire-payment-href:${href.split("?")[0]}`;
  return item.id;
}

export function buildPlatformNotificationInboxRows(
  items: readonly PlatformNotificationListItem[],
  payloadHireGroupIdById?: Record<string, string | null | undefined>,
): PlatformNotificationInboxRow[] {
  const buckets = new Map<string, PlatformNotificationListItem[]>();
  for (const item of items) {
    const key = platformNotificationGroupingKey({
      id: item.id,
      type: item.type,
      display: item.display,
      payloadHireGroupId: payloadHireGroupIdById?.[item.id] ?? item.payloadHireGroupId,
    });
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const rows: PlatformNotificationInboxRow[] = [];
  for (const group of buckets.values()) {
    const sorted = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = sorted[0];
    if (!latest) continue;
    const unread = sorted.some((item) => !item.readAt);
    const groupedCount = sorted.length;
    const display =
      groupedCount > 1
        ? {
            ...latest.display,
            body: `${latest.display.body} Related review events are grouped here.`,
          }
        : latest.display;

    rows.push({
      id: latest.id,
      ids: sorted.map((item) => item.id),
      type: latest.type,
      readAt: unread ? null : latest.readAt,
      createdAt: latest.createdAt,
      unread,
      groups: platformNotificationGroups(latest.type),
      tone: platformNotificationTone(latest.type),
      display,
      groupedCount,
    });
  }

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function filterPlatformNotificationInboxRows(
  rows: readonly PlatformNotificationInboxRow[],
  filter: PlatformNotificationInboxFilter,
): PlatformNotificationInboxRow[] {
  if (filter === "all") return [...rows];
  if (filter === "unread") return rows.filter((row) => row.unread);
  return rows.filter((row) => row.groups.includes(filter));
}

export function formatPlatformNotificationInboxTime(createdAt: string): string {
  const day = ukLondonDayYmd(createdAt);
  if (day && day === ukTodayYmd()) return `Today, ${formatUkTime(createdAt)}`;
  return formatUkDateTimeText(createdAt);
}

export function mapPlatformNotificationListItems(
  rows: Array<{
    id: string;
    type: string;
    payload?: unknown;
    read_at?: string | null;
    created_at?: string | null;
  }>,
): { items: PlatformNotificationListItem[]; payloadHireGroupIdById: Record<string, string | null> } {
  const payloadHireGroupIdById: Record<string, string | null> = {};
  const items = rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const hireGroupId = typeof payload.hireGroupId === "string" ? payload.hireGroupId : null;
    payloadHireGroupIdById[row.id] = hireGroupId;
    return {
      id: row.id,
      type: row.type,
      readAt: row.read_at ?? null,
      createdAt: row.created_at ?? "",
      display: formatPlatformNotification(row.type, payload),
      payloadHireGroupId: hireGroupId,
    };
  });
  return { items, payloadHireGroupIdById };
}
