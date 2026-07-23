"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { approveHirePaymentRowAction, rejectHirePaymentRowAction } from "@/app/actions/hire-payments";
import { formatUkDate } from "@/lib/datetime/uk";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useState, useTransition } from "react";

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

function ApproveRejectRow({
  row,
  onDone,
}: {
  row: HirePaymentPageRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveHirePaymentRowAction(row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectHirePaymentRowAction({ scheduleRowId: row.id, comment });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRejectOpen(false);
      setComment("");
      onDone();
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-rph-border pt-3">
      {row.pendingSubmittedGbp != null ? (
        <p className="text-sm text-rph-fg-secondary">
          Submitted: <span className="font-medium text-rph-fg">{formatGbp(row.pendingSubmittedGbp)}</span>
        </p>
      ) : null}
      {error ? <p className="rph-alert-error text-xs">{error}</p> : null}
      {!rejectOpen ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rph-btn-primary h-8 px-3 text-xs" disabled={pending} onClick={approve}>
            Approve
          </button>
          <button
            type="button"
            className="rph-btn-ghost h-8 px-3 text-xs"
            disabled={pending}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className="rph-input min-h-[4rem] w-full text-sm"
            placeholder="Reason for rejection (required)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="rph-btn-primary h-8 px-3 text-xs" disabled={pending} onClick={reject}>
              Confirm reject
            </button>
            <button
              type="button"
              className="rph-btn-ghost h-8 px-3 text-xs"
              disabled={pending}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
  const filtered = rows.filter((row) => {
    if (filter === "outstanding") return row.balanceGbp > 0 && row.paymentStatus !== "pending_approval";
    if (filter === "pending") return row.paymentStatus === "pending_approval";
    return true;
  });

  if (!filtered.length) {
    return <p className="rph-muted text-sm">No payment rows match this filter.</p>;
  }

  return (
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
              <ApproveRejectRow row={row} onDone={onRefresh} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
