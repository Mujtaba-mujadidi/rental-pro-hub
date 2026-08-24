"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { HirePaymentReviewModal } from "@/components/fleet/hire-payments/hire-payment-review-modal";
import { formatUkDate } from "@/lib/datetime/uk";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  not_received: "Outstanding",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function statusTone(status: string): "neutral" | "pending" | "success" | "warning" | "error" {
  if (status === "approved") return "success";
  if (status === "pending_approval") return "pending";
  if (status === "rejected") return "error";
  return "neutral";
}

function RowProgress({ paid, net }: { paid: number; net: number }) {
  const pct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rph-chrome">
      <div className="h-full rounded-full bg-rph-rail transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function HirePaymentScheduleList({
  rows,
  filter,
  canApprove,
  onRefresh,
}: {
  rows: HirePaymentPageRow[];
  filter: "all" | "outstanding" | "pending";
  canApprove: boolean;
  onRefresh: () => void;
}) {
  const [reviewRow, setReviewRow] = useState<HirePaymentPageRow | null>(null);

  const filtered = rows.filter((row) => {
    if (filter === "outstanding") return row.balanceGbp > 0 && row.paymentStatus !== "pending_approval";
    if (filter === "pending") return row.paymentStatus === "pending_approval";
    return true;
  });

  if (!filtered.length) {
    return <p className="rph-muted text-sm">No payment rows match this filter.</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {filtered.map((row) => {
          const label =
            row.rowKind === "deposit"
              ? "Deposit"
              : `${formatUkDate(row.periodStart)} – ${formatUkDate(row.periodEnd)}`;
          const tone = statusTone(row.paymentStatus);
          return (
            <li key={row.id} className="rph-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-rph-fg">{label}</p>
                  {!row.accrued ? (
                    <p className="rph-meta text-xs">Not yet due</p>
                  ) : (
                    <p className="rph-meta text-xs capitalize">{row.rowKind}</p>
                  )}
                </div>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}
                >
                  {STATUS_LABELS[row.paymentStatus] ?? row.paymentStatus}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-rph-fg-muted">Due</dt>
                  <dd className="font-medium tabular-nums text-rph-fg">{formatGbp(row.netDueGbp)}</dd>
                </div>
                <div>
                  <dt className="text-rph-fg-muted">Paid</dt>
                  <dd className="font-medium tabular-nums text-rph-fg">{formatGbp(row.paidGbp)}</dd>
                </div>
                <div>
                  <dt className="text-rph-fg-muted">Balance</dt>
                  <dd className="font-medium tabular-nums text-rph-fg">{formatGbp(row.balanceGbp)}</dd>
                </div>
              </dl>

              {row.discountTotalGbp > 0 ? (
                <p className="rph-meta mt-2 text-xs">Includes {formatGbp(row.discountTotalGbp)} discount</p>
              ) : null}

              <RowProgress paid={row.paidGbp} net={row.netDueGbp} />

              {canApprove && row.paymentStatus === "pending_approval" ? (
                <div className="mt-3 border-t border-rph-border pt-3">
                  <button
                    type="button"
                    className="rph-btn-primary h-9 w-full px-3 text-sm sm:w-auto"
                    onClick={() => setReviewRow(row)}
                  >
                    Review payment
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <HirePaymentReviewModal
        target={reviewRow ? { kind: "schedule", row: reviewRow } : null}
        open={reviewRow != null}
        onClose={() => setReviewRow(null)}
        onSuccess={onRefresh}
      />
    </>
  );
}
