"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { HirePaymentRowActions } from "@/components/fleet/hire-payments/hire-payment-row-actions";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import {
  balanceRentScheduleAdjustmentLabel,
  balanceRentScheduleBalanceTone,
  balanceRentSchedulePeriodLabel,
} from "@/lib/fleet/hire-active-balance-display";
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
import {
  upcomingPaymentPeriodLabel,
  upcomingPaymentStatusLabel,
} from "@/lib/fleet/hire-active-payments-display";
import { useMemo, useState } from "react";

function periodCell(row: HirePaymentPageRow, compact = false): string {
  if (compact) return upcomingPaymentPeriodLabel(row);
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
      id: row.id,
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

function moneyCell(workspaceTable: boolean, value: number, emptyDash = false) {
  const text = emptyDash && value <= 0.005 ? "—" : formatGbp(value);
  if (workspaceTable) return text;
  return <span className="rph-table-cell-value">{text}</span>;
}

export function HirePaymentScheduleTable({
  rows,
  canRecordOnRow,
  canApprove,
  canApplyDiscount,
  highlightedRowIds,
  contractEndedYmd,
  settlementSettled = false,
  refundMarkByRowId,
  audience = "staff",
  readOnly = false,
  showActions = true,
  variant = "default",
  showFilters,
  onRefresh,
}: {
  rows: HirePaymentPageRow[];
  canRecordOnRow: boolean;
  canApprove: boolean;
  canApplyDiscount: boolean;
  highlightedRowIds?: string[];
  contractEndedYmd?: string | null;
  settlementSettled?: boolean;
  refundMarkByRowId?: ReadonlyMap<string, "refunded" | "partial">;
  audience?: HirePaymentDisplayAudience;
  readOnly?: boolean;
  showActions?: boolean;
  variant?: "default" | "workspace" | "balance";
  /** When omitted, filters show for non-balance tables only. */
  showFilters?: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HirePaymentDisplayStatus>("all");
  const [rowError, setRowError] = useState<string | null>(null);
  const todayYmd = ukTodayYmd();
  const workspaceTable = variant === "workspace" || variant === "balance";
  const balanceTable = variant === "balance";
  const filtersEnabled = showFilters ?? !balanceTable;
  const displayOptions = useMemo(
    () => ({ contractEndedYmd, settlementSettled, audience, refundMarkByRowId }),
    [audience, contractEndedYmd, refundMarkByRowId, settlementSettled],
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
    if (!filtersEnabled) {
      return [...rows].sort((a, b) => {
        if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
        return a.sortOrder - b.sortOrder;
      });
    }
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
          row.baseAmountGbp,
          row.discountTotalGbp,
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
  }, [audience, displayOptions, filtersEnabled, rows, search, statusFilter, todayYmd]);

  const includeActions = showActions;
  const emptyColSpan = includeActions ? 8 : 7;

  const periodLabel = (row: HirePaymentPageRow, compact = false) => {
    if (balanceTable) return balanceRentSchedulePeriodLabel(row);
    return periodCell(row, compact);
  };

  const tableBody = (
    <table
      className={
        workspaceTable
          ? includeActions
            ? "hire-ws-payments-table"
            : "hire-ws-payments-table hire-ws-payments-table-no-actions"
          : "w-full text-sm"
      }
    >
      {workspaceTable ? (
        <colgroup>
          <col className="hire-ws-payments-col-period" />
          <col className="hire-ws-payments-col-amount" />
          <col className="hire-ws-payments-col-amount" />
          <col className="hire-ws-payments-col-amount" />
          <col className="hire-ws-payments-col-amount" />
          <col className="hire-ws-payments-col-amount" />
          <col className="hire-ws-payments-col-status" />
          {includeActions ? <col className="hire-ws-payments-col-action" /> : null}
        </colgroup>
      ) : null}
      <thead className={workspaceTable ? undefined : "sticky top-0 z-10"}>
        <tr
          className={
            workspaceTable
              ? undefined
              : "border-b border-rph-border bg-rph-chrome text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted shadow-[0_1px_0_0_var(--rph-border)]"
          }
        >
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            {balanceTable ? "Rent date" : "Period"}
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            {balanceTable ? "Scheduled" : "Due"}
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            {balanceTable ? "Adjustment" : "Discount"}
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            {balanceTable ? "Charged" : "After discount"}
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            Paid
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            Balance
          </th>
          <th scope="col" className={workspaceTable ? undefined : "px-4 py-2.5"}>
            Status
          </th>
          {includeActions ? (
            <th scope="col" className={workspaceTable ? "text-right" : "px-4 py-2.5 text-right"}>
              Action
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className={workspaceTable ? undefined : "divide-y divide-rph-border"}>
        {!filtered.length ? (
          <tr>
            <td
              colSpan={emptyColSpan}
              className={
                workspaceTable
                  ? "hire-ws-payments-table-empty"
                  : "px-4 py-8 text-center text-rph-fg-muted"
              }
            >
              No payment rows match your filters.
            </td>
          </tr>
        ) : (
          filtered.map((row) => {
            const highlighted = highlightSet.has(row.id);
            const displayStatus = rowDisplayStatus(row, todayYmd, displayOptions);
            const statusMeta = hirePaymentDisplayStatusMeta(displayStatus, { audience });
            const workspaceStatus = upcomingPaymentStatusLabel(row, todayYmd, displayOptions);
            const balanceTone = balanceTable
              ? balanceRentScheduleBalanceTone(displayStatus, row.balanceGbp)
              : null;
            const rowClass = workspaceTable
              ? highlighted
                ? "hire-ws-payments-table-row-highlight"
                : undefined
              : highlighted
                ? "bg-rph-rail/10"
                : displayStatus === "overdue"
                  ? "bg-red-50/40 dark:bg-red-950/15"
                  : displayStatus === "pending_approval"
                    ? "bg-amber-50/50 dark:bg-amber-950/20"
                    : "bg-rph-raised/30";

            return (
              <tr key={row.id} className={rowClass}>
                <td
                  data-label={balanceTable ? "Rent date" : "Period"}
                  className={workspaceTable ? undefined : "rph-table-primary px-4 py-3"}
                >
                  {workspaceTable ? (
                    <>
                      <span className="hire-ws-payments-period-label">{periodLabel(row, true)}</span>
                      {highlighted ? (
                        <p className="mt-0.5 hidden text-[10px] font-medium text-rph-link sm:mt-1 sm:block sm:text-xs">
                          Allocated in payment
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-rph-fg">{periodLabel(row)}</p>
                      <p className="rph-meta text-xs capitalize">{row.rowKind}</p>
                      {highlighted ? (
                        <p className="mt-1 text-xs font-medium text-rph-link">Allocated in payment</p>
                      ) : null}
                    </>
                  )}
                </td>
                <td
                  data-label={balanceTable ? "Scheduled" : "Due"}
                  className={workspaceTable ? "tabular-nums" : "px-4 py-3 tabular-nums"}
                >
                  {moneyCell(workspaceTable, row.baseAmountGbp)}
                </td>
                <td
                  data-label={balanceTable ? "Adjustment" : "Discount"}
                  className={workspaceTable ? "tabular-nums" : "px-4 py-3 tabular-nums"}
                >
                  {balanceTable
                    ? balanceRentScheduleAdjustmentLabel(row.discountTotalGbp)
                    : moneyCell(workspaceTable, row.discountTotalGbp, true)}
                </td>
                <td
                  data-label={balanceTable ? "Charged" : "After discount"}
                  className={workspaceTable ? "tabular-nums font-medium" : "px-4 py-3 tabular-nums font-medium"}
                >
                  {moneyCell(workspaceTable, row.netDueGbp)}
                </td>
                <td data-label="Paid" className={workspaceTable ? "tabular-nums" : "px-4 py-3 tabular-nums"}>
                  {moneyCell(workspaceTable, row.paidGbp)}
                </td>
                <td
                  data-label="Balance"
                  className={
                    balanceTable
                      ? `hire-ws-payments-balance-cell tabular-nums font-semibold ${
                          balanceTone === "paid"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : balanceTone === "upcoming"
                              ? "text-rph-fg-muted"
                              : "text-amber-800 dark:text-amber-200"
                        }`
                      : workspaceTable
                        ? "tabular-nums font-medium"
                        : "px-4 py-3 tabular-nums font-medium"
                  }
                >
                  {moneyCell(workspaceTable, row.balanceGbp)}
                </td>
                <td
                  data-label={workspaceTable ? "" : "Status"}
                  className={
                    workspaceTable
                      ? "hire-ws-payments-status-cell"
                      : "px-4 py-3"
                  }
                >
                  {workspaceTable ? (
                    <span
                      className={`hire-ws-payments-status-pill ${hireTableStatusToneClass(workspaceStatus.tone)}`}
                    >
                      {workspaceStatus.label}
                    </span>
                  ) : (
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
                  )}
                </td>
                {includeActions ? (
                  <td
                    data-label="Actions"
                    className={
                      workspaceTable ? "hire-ws-payments-table-actions" : "rph-table-actions px-4 py-3 text-right"
                    }
                  >
                    <HirePaymentRowActions
                      row={row}
                      canRecordOnRow={canRecordOnRow}
                      canApprove={canApprove}
                      canApplyDiscount={canApplyDiscount}
                      readOnly={readOnly}
                      onRefresh={onRefresh}
                      onError={setRowError}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div className={balanceTable ? "hire-balance-rent-schedule-table" : "space-y-3"}>
      {filtersEnabled ? (
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
          <div className="min-w-[10rem] space-y-1">
            <span className="text-xs font-medium text-rph-fg-muted">Status</span>
            <RphSelect
              value={statusFilter}
              aria-label="Filter by status"
              options={statusFilterOptions}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            />
          </div>
        </div>
      ) : null}

      {readOnly && !balanceTable ? (
        <p className="rph-muted text-sm">
          Contract ended — schedule is read-only. Prepaid periods the company has paid back are marked Refunded. Open History on a row to view payment audit.
        </p>
      ) : null}

      {rowError ? <p className="rph-alert-error text-sm">{rowError}</p> : null}

      {workspaceTable ? (
        <div className={`hire-ws-payments-table-wrap ${balanceTable ? "hire-balance-rent-schedule-table-wrap" : "!px-0 !pb-0"}`}>
          <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-y-contain">{tableBody}</div>
        </div>
      ) : (
        <div className="rph-table-responsive">
          <div className="lg:max-h-[min(60vh,28rem)] lg:overflow-y-auto lg:overscroll-y-contain">{tableBody}</div>
        </div>
      )}
    </div>
  );
}
