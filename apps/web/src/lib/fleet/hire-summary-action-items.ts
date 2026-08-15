import type { HirePaymentAttentionItem } from "@/lib/fleet/hire-payment-analytics";
import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";
import type { ActiveHirePaymentPosition } from "@/lib/fleet/hire-active-summary-display";
import { formatGbp } from "@/lib/fleet/maintenance";

export type HireSummaryActionIcon = "warning" | "pound" | "count" | "insurance";

export type HireSummaryActionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  warn: boolean;
  icon: HireSummaryActionIcon;
  iconCount?: number;
};

const LIFECYCLE_SUMMARY_EXCLUDE = new Set<HireLifecycleAttentionItem["kind"]>([
  "awaiting_termination",
]);

export function buildHireSummaryActionItems(input: {
  lifecycleAttentionItems: readonly HireLifecycleAttentionItem[];
  attentionItems: readonly HirePaymentAttentionItem[];
  position: ActiveHirePaymentPosition;
  paymentsHref: string;
  includeDeposit: boolean;
  audience?: "staff" | "driver";
}): HireSummaryActionItem[] {
  const audience = input.audience ?? "staff";
  const items: HireSummaryActionItem[] = [];
  const seen = new Set<string>();

  for (const item of input.lifecycleAttentionItems) {
    if (LIFECYCLE_SUMMARY_EXCLUDE.has(item.kind)) continue;
    const key = `lifecycle:${item.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(mapLifecycleActionItem(item));
  }

  if (
    input.includeDeposit &&
    input.position.depositOutstandingGbp > 0.005 &&
    !items.some((item) => item.title.toLowerCase().includes("deposit"))
  ) {
    items.push({
      key: "payment:deposit",
      title: audience === "driver" ? "Deposit not paid" : "Deposit has not been paid",
      detail:
        audience === "driver"
          ? `You still owe ${formatGbp(input.position.depositOutstandingGbp)}`
          : `${formatGbp(input.position.depositOutstandingGbp)} remains outstanding`,
      href: input.paymentsHref,
      warn: true,
      icon: "pound",
    });
  }

  for (const item of input.attentionItems) {
    const key = `payment:${item.kind}:${item.rowId}`;
    if (seen.has(key)) continue;
    if (item.title.toLowerCase().includes("deposit") && items.some((i) => i.title.toLowerCase().includes("deposit"))) {
      continue;
    }
    seen.add(key);
    items.push(formatPaymentAttentionActionItem(item, input.paymentsHref, audience));
  }

  return items;
}

function mapLifecycleActionItem(item: HireLifecycleAttentionItem): HireSummaryActionItem {
  if (item.kind === "documents_expiring_during_hire") {
    const countMatch = item.detail.match(/^(\d+) documents:\s*(.+)$/);
    const iconCount = countMatch ? Number(countMatch[1]) : undefined;
    const detail = countMatch?.[2] ?? item.detail;
    return {
      key: `lifecycle:${item.kind}`,
      title: item.title,
      detail,
      href: item.href,
      warn: true,
      icon: "count",
      iconCount: iconCount && iconCount > 0 ? iconCount : undefined,
    };
  }

  const isInsurance =
    item.kind === "awaiting_insurance_upload" ||
    item.kind === "insurance_expiring" ||
    item.kind === "insurance_expired";

  return {
    key: `lifecycle:${item.kind}`,
    title: item.title,
    detail: item.detail,
    href: item.href,
    warn: true,
    icon: isInsurance ? "insurance" : "warning",
  };
}

function formatPaymentAttentionActionItem(
  item: HirePaymentAttentionItem,
  paymentsHref: string,
  audience: "staff" | "driver" = "staff",
): HireSummaryActionItem {
  const amount = formatGbp(item.amountGbp);
  const isDeposit = item.title.toLowerCase().includes("deposit");

  if (isDeposit) {
    return {
      key: `payment:${item.kind}:${item.rowId}`,
      title: audience === "driver" ? "Deposit not paid" : "Deposit has not been paid",
      detail:
        audience === "driver" ? `You still owe ${amount}` : `${amount} remains outstanding`,
      href: paymentsHref,
      warn: true,
      icon: "pound",
    };
  }

  if (item.kind === "overdue") {
    return {
      key: `payment:${item.kind}:${item.rowId}`,
      title: item.title,
      detail: audience === "driver" ? `${amount} overdue — pay now` : `${amount} overdue`,
      href: paymentsHref,
      warn: true,
      icon: "pound",
    };
  }

  if (item.kind === "due") {
    return {
      key: `payment:${item.kind}:${item.rowId}`,
      title: item.title,
      detail: audience === "driver" ? `${amount} due today` : `${amount} due today`,
      href: paymentsHref,
      warn: true,
      icon: "pound",
    };
  }

  if (item.kind === "pending_approval") {
    return {
      key: `payment:${item.kind}:${item.rowId}`,
      title: item.title,
      detail:
        audience === "driver"
          ? `${amount} awaiting company approval`
          : `${amount} pending approval`,
      href: paymentsHref,
      warn: true,
      icon: "pound",
    };
  }

  return {
    key: `payment:${item.kind}:${item.rowId}`,
    title: item.title,
    detail:
      audience === "driver"
        ? `${amount} rejected — submit again`
        : `${amount} rejected — record again`,
    href: paymentsHref,
    warn: true,
    icon: "pound",
  };
}
