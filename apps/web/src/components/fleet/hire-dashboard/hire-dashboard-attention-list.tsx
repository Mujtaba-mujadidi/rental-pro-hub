"use client";

import type { HirePaymentAttentionItem } from "@/lib/fleet/hire-payment-analytics";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";

const KIND_LABELS: Record<HirePaymentAttentionItem["kind"], string> = {
  overdue: "Overdue",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  due: "Due now",
};

export function HireDashboardAttentionList({
  items,
  paymentsHref,
  paymentsLabel = "View payments",
  onOpenPayments,
}: {
  items: HirePaymentAttentionItem[];
  paymentsHref?: string;
  paymentsLabel?: string;
  onOpenPayments?: () => void;
}) {
  if (!items.length) return null;

  return (
    <section className="rph-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-rph-fg">Needs attention</h2>
        {onOpenPayments ? (
          <button
            type="button"
            className="text-xs font-medium text-rph-link hover:text-rph-link-hover"
            onClick={onOpenPayments}
          >
            {paymentsLabel}
          </button>
        ) : paymentsHref ? (
          <Link href={paymentsHref} className="text-xs font-medium text-rph-link hover:text-rph-link-hover">
            {paymentsLabel}
          </Link>
        ) : null}
      </div>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 6).map((item) => (
          <li
            key={`${item.kind}:${item.rowId}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">
                {KIND_LABELS[item.kind]}
              </p>
              <p className="truncate font-medium text-rph-fg">{item.title}</p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums text-rph-fg">
              {formatGbp(item.amountGbp)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
