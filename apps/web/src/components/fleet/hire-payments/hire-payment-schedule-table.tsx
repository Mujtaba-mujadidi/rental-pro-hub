"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { HirePaymentRowActions } from "@/components/fleet/hire-payments/hire-payment-row-actions";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import {
  deriveHirePaymentDisplayStatus,
  HIRE_PAYMENT_DISPLAY_STATUSES,
  hirePaymentDisplayStatusMeta,
  type HirePaymentDisplayAudience,
  type HirePaymentDisplayOptions,
  type HirePaymentDisplayStatus,
} from "@/lib/fleet/hire-payment-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useMemo, useState } from "react";

function periodCell(row: HirePaymentPageRow): string {
  if (row.rowKind === "deposit") return "Deposit";
  return `${formatUkDate(row.periodStart)} – ${formatUkDate(row.periodEnd)}`;
}

function rowDisplayStatus(
  row: HirePaymentPageRow,
  todayYmd: string,
  displayOptions: HirePaymentDisplayOptions,
): HirePaymentDisplayStatus {
  return deriveHirePaymentDisplayStatus(
    {
      paymentStatus: row.paymentStatus,
      balanceGbp: row.balanceGbp,
      paidGbp: row.paidGbp,
      netDueGbp: row.netDueGbp,
      accrued: row.accrued,
      periodEnd: row.periodEnd,
      periodStart: row.periodStart,
      pendingSubmittedGbp: row.pendingSubmittedGbp,
    },
    todayYmd,
    displayOptions,
  );
}

export function HirePaymentScheduleTable({
  rows,
  canRecordOnRow,
  canApprove,
  canApplyDiscount,
  highlightedRowIds,
  contractEndedYmd,
  settlementSettled = false,
  audience = "staff",
  readOnly = false,
  onRefresh,
}: {
  rows: HirePaymentPageRow[];
  canRecordOnRow: boolean;
  canApprove: boolean;
  canApplyDiscount: boolean;
  highlightedRowIds?: string[];
  contractEndedYmd?: string | null;
  settlementSettled?: boolean;
  audience?: HirePaymentDisplayAudience;
  readOnly?: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HirePaymentDisplayStatus>("all");
  const [rowError, setRowError] = useState<string | null>(null);
  const todayYmd = ukTodayYmd();
  const displayOptions = useMemo(
    () => ({ contractEndedYmd, settlementSettled, audience }),
    [audience, contractEndedYmd, settlementSettled],
  );
  const statusFilterOptions = useMemo(
    () => [
      { value: "all" as const, label: "All statuses" },
      ...HIRE_PAYMENT_DISPLAY_STATUSES.map((status) => ({
        value: status,
        label: hirePaymentDisplayStatusMeta(status, { audience }).label,
      })),
    ],
    [audience],
  );

  const highlightSet = useMemo(() => new Set(highlightedRowIds ?? []), [highlightedRowIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (statusFilter === "all") return true;
        return rowDisplayStatus(row, todayYmd, displayOptions) === statusFilter;
      })
      .filter((row) => {
        if (!term) return true;
        const displayStatus = rowDisplayStatus(row, todayYmd, displayOptions);
        const statusMeta = hirePaymentDisplayStatusMeta(displayStatus, { audience });
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
  }, [audience, displayOptions, rows, search, statusFilter, todayYmd]);

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
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {readOnly ? (
        <p className="rph-muted text-sm">
          Contract ended — schedule is read-only. Open History on a row to view payment audit.
        </p>
      ) : null}

      {rowError ? <p className="rph-alert-error text-sm">{rowError}</p> : null}

      <div className="rph-table-responsive">
        <div className="lg:max-h-[min(60vh,28rem)] lg:overflow-y-auto lg:overscroll-y-contain">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-rph-border bg-rph-chrome text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted shadow-[0_1px_0_0_var(--rph-border)]">
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Paid</th>
                <th className="px-4 py-2.5">Balance</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">{readOnly ? "History" : "Actions"}</th>
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
                  const displayStatus = rowDisplayStatus(row, todayYmd, displayOptions);
                  const statusMeta = hirePaymentDisplayStatusMeta(displayStatus, { audience });
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
                      <td data-label="Period" className="rph-table-primary px-4 py-3">
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
                      <td data-label="Due" className="px-4 py-3 tabular-nums">
                        <span className="rph-table-cell-value">{formatGbp(row.netDueGbp)}</span>
                      </td>
                      <td data-label="Paid" className="px-4 py-3 tabular-nums">
                        <span className="rph-table-cell-value">{formatGbp(row.paidGbp)}</span>
                      </td>
                      <td data-label="Balance" className="px-4 py-3 tabular-nums font-medium">
                        <span className="rph-table-cell-value">{formatGbp(row.balanceGbp)}</span>
                      </td>
                      <td data-label="Status" className="px-4 py-3">
                        <div className="rph-table-cell-value">
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
                        </div>
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <HirePaymentRowActions
                            row={row}
                            canRecordOnRow={canRecordOnRow}
                            canApprove={canApprove}
                            canApplyDiscount={canApplyDiscount}
                            readOnly={readOnly}
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
  );
}
