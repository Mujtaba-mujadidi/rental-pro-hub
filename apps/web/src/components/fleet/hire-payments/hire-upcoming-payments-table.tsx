"use client";

import type { HirePaymentPageRow } from "@/app/actions/hire-payments";
import { HirePaymentRowActions } from "@/components/fleet/hire-payments/hire-payment-row-actions";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import {
  upcomingPaymentPeriodLabel,
  upcomingPaymentStatusLabel,
} from "@/lib/fleet/hire-active-payments-display";
import type { HirePaymentDisplayOptions } from "@/lib/fleet/hire-payment-display";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useMemo, useState } from "react";

export function HireUpcomingPaymentsTable({
  rows,
  canRecordOnRow,
  canApprove,
  canApplyDiscount,
  highlightedRowIds,
  displayOptions,
  showActions = true,
  onRefresh,
}: {
  rows: HirePaymentPageRow[];
  canRecordOnRow: boolean;
  canApprove: boolean;
  canApplyDiscount: boolean;
  highlightedRowIds?: string[];
  displayOptions: HirePaymentDisplayOptions;
  showActions?: boolean;
  onRefresh: () => void;
}) {
  const [rowError, setRowError] = useState<string | null>(null);
  const todayYmd = ukTodayYmd();
  const highlightSet = useMemo(() => new Set(highlightedRowIds ?? []), [highlightedRowIds]);
  const colSpan = showActions ? 8 : 7;

  return (
    <div className="space-y-3">
      {rowError ? <p className="rph-alert-error text-sm">{rowError}</p> : null}
      <div className="hire-ws-payments-table-wrap">
        <table className={showActions ? "hire-ws-payments-table" : "hire-ws-payments-table hire-ws-payments-table-no-actions"}>
          <colgroup>
            <col className="hire-ws-payments-col-period" />
            <col className="hire-ws-payments-col-amount" />
            <col className="hire-ws-payments-col-amount" />
            <col className="hire-ws-payments-col-amount" />
            <col className="hire-ws-payments-col-amount" />
            <col className="hire-ws-payments-col-amount" />
            <col className="hire-ws-payments-col-status" />
            {showActions ? <col className="hire-ws-payments-col-action" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Due</th>
              <th scope="col">Discount</th>
              <th scope="col">After discount</th>
              <th scope="col">Paid</th>
              <th scope="col">Balance</th>
              <th scope="col">Status</th>
              {showActions ? (
                <th scope="col" className="text-right">
                  Action
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={colSpan} className="hire-ws-payments-table-empty">
                  No upcoming payments right now.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const highlighted = highlightSet.has(row.id);
                const status = upcomingPaymentStatusLabel(row, todayYmd, displayOptions);
                return (
                  <tr key={row.id} className={highlighted ? "hire-ws-payments-table-row-highlight" : undefined}>
                    <td data-label="Period">
                      <span className="hire-ws-payments-period-label">{upcomingPaymentPeriodLabel(row)}</span>
                    </td>
                    <td data-label="Due" className="tabular-nums">
                      {formatGbp(row.baseAmountGbp)}
                    </td>
                    <td data-label="Discount" className="tabular-nums">
                      {row.discountTotalGbp > 0.005 ? formatGbp(row.discountTotalGbp) : "—"}
                    </td>
                    <td data-label="After discount" className="tabular-nums font-medium">
                      {formatGbp(row.netDueGbp)}
                    </td>
                    <td data-label="Paid" className="tabular-nums">
                      {formatGbp(row.paidGbp)}
                    </td>
                    <td data-label="Balance" className="tabular-nums font-medium">
                      {formatGbp(row.balanceGbp)}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`hire-ws-payments-status-pill ${hireTableStatusToneClass(status.tone)}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    {showActions ? (
                      <td data-label="Actions" className="hire-ws-payments-table-actions">
                        <HirePaymentRowActions
                          row={row}
                          canRecordOnRow={canRecordOnRow}
                          canApprove={canApprove}
                          canApplyDiscount={canApplyDiscount}
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
      </div>
    </div>
  );
}
