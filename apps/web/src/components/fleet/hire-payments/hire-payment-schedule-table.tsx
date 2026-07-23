"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { HirePaymentRowActions } from "@/components/fleet/hire-payments/hire-payment-row-actions";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import {
  deriveHirePaymentDisplayStatus,
  HIRE_PAYMENT_DISPLAY_STATUSES,
  hirePaymentDisplayStatusMeta,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useMemo, useState } from "react";

const STATUS_FILTER_OPTIONS: { value: "all" | HirePaymentDisplayStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...HIRE_PAYMENT_DISPLAY_STATUSES.map((status) => ({
    value: status,
    label: hirePaymentDisplayStatusMeta(status).label,
  })),
];

function periodCell(row: HirePaymentPageRow): string {
  if (row.rowKind === "deposit") return "Deposit";
  return `${formatUkDate(row.periodStart)} – ${formatUkDate(row.periodEnd)}`;
}

function rowDisplayStatus(row: HirePaymentPageRow, todayYmd: string): HirePaymentDisplayStatus {
  return deriveHirePaymentDisplayStatus(
    {
      paymentStatus: row.paymentStatus,
      balanceGbp: row.balanceGbp,
      paidGbp: row.paidGbp,
      netDueGbp: row.netDueGbp,
      accrued: row.accrued,
      periodEnd: row.periodEnd,
      pendingSubmittedGbp: row.pendingSubmittedGbp,
    },
    todayYmd,
  );
}

export function HirePaymentScheduleTable({
  rows,
  canRecordOnRow,
  canApprove,
  canApplyDiscount,
  highlightedRowIds,
  onRefresh,
}: {
  rows: HirePaymentPageRow[];
  canRecordOnRow: boolean;
  canApprove: boolean;
  canApplyDiscount: boolean;
  highlightedRowIds?: string[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HirePaymentDisplayStatus>("all");
  const [rowError, setRowError] = useState<string | null>(null);
  const todayYmd = ukTodayYmd();

  const highlightSet = useMemo(() => new Set(highlightedRowIds ?? []), [highlightedRowIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (statusFilter === "all") return true;
        return rowDisplayStatus(row, todayYmd) === statusFilter;
      })
      .filter((row) => {
        if (!term) return true;
        const displayStatus = rowDisplayStatus(row, todayYmd);
        const statusMeta = hirePaymentDisplayStatusMeta(displayStatus);
        const hay = [
          periodCell(row),
          row.rowKind,
          row.paymentStatus,
          displayStatus,
          statusMeta.label,
          row.netDueGbp,
          row.paidGbp,
          row.balanceGbp,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      })
      .sort((a, b) => {
        if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
        return a.sortOrder - b.sortOrder;
      });
  }, [rows, search, statusFilter, todayYmd]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Search</span>
          <input
            className="rph-input w-full"
            placeholder="Period, status, amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Status</span>
          <select
            className="rph-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rowError ? <p className="rph-alert-error text-sm">{rowError}</p> : null}

      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[48rem] overflow-hidden rounded-xl border border-rph-border">
          <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-y-contain">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-rph-border bg-rph-chrome text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted shadow-[0_1px_0_0_var(--rph-border)]">
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Paid</th>
                <th className="px-4 py-2.5">Balance</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rph-border">
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-rph-fg-muted">
                    No payment rows match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const highlighted = highlightSet.has(row.id);
                  const displayStatus = rowDisplayStatus(row, todayYmd);
                  const statusMeta = hirePaymentDisplayStatusMeta(displayStatus);
                  return (
                    <tr
                      key={row.id}
                      className={
                        highlighted
                          ? "bg-rph-rail/10"
                          : displayStatus === "overdue"
                            ? "bg-red-50/40 dark:bg-red-950/15"
                            : displayStatus === "pending_approval"
                              ? "bg-amber-50/50 dark:bg-amber-950/20"
                              : "bg-rph-raised/30"
                      }
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-rph-fg">{periodCell(row)}</p>
                        <p className="rph-meta text-xs capitalize">{row.rowKind}</p>
                        {row.discountTotalGbp > 0 ? (
                          <p className="rph-meta text-xs">Discount {formatGbp(row.discountTotalGbp)}</p>
                        ) : null}
                        {row.discounts.length > 0 ? (
                          <ul className="rph-meta mt-1 space-y-0.5 text-[10px]">
                            {row.discounts.map((d) => (
                              <li key={d.id}>
                                −{formatGbp(d.amountGbp)} · {d.reason}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {highlighted ? (
                          <p className="mt-1 text-xs font-medium text-rph-link">Allocated in payment</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatGbp(row.netDueGbp)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatGbp(row.paidGbp)}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">{formatGbp(row.balanceGbp)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(statusMeta.tone)}`}
                        >
                          {statusMeta.label}
                        </span>
                        {row.pendingSubmittedGbp != null ? (
                          <p className="mt-1 text-xs font-medium text-rph-fg-secondary">
                            {formatGbp(row.pendingSubmittedGbp)} submitted — awaiting approval
                          </p>
                        ) : row.paymentStatus === "pending_approval" ? (
                          <p className="rph-meta mt-1 text-xs">Awaiting company approval</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <HirePaymentRowActions
                            row={row}
                            canRecordOnRow={canRecordOnRow}
                            canApprove={canApprove}
                            canApplyDiscount={canApplyDiscount}
                            onRefresh={onRefresh}
                            onError={setRowError}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
