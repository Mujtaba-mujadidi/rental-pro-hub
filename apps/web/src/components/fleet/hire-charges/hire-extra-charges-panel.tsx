"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveDriverExtraChargePaymentAction,
  rejectDriverExtraChargePaymentAction,
} from "@/app/actions/hire-driver-charges";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { HireAddChargeModal } from "@/components/fleet/hire-charges/hire-add-charge-modal";
import { HireChargeHistoryModal } from "@/components/fleet/hire-charges/hire-charge-history-modal";
import { HireVoidChargeModal } from "@/components/fleet/hire-charges/hire-void-charge-modal";
import { HireExtraChargeRowActions } from "@/components/fleet/hire-charges/hire-extra-charge-row-actions";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { formatUkDate } from "@/lib/datetime/uk";
import { balanceRentScheduleAdjustmentLabel } from "@/lib/fleet/hire-active-balance-display";
import {
  buildExtraChargePaymentTableRowsFromWorkspace,
  extraChargePaymentStatusClass,
} from "@/lib/fleet/hire-driver-charge-payment";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireExtraChargesPanel({
  hireGroupId,
  items,
  outstandingGbp,
  pendingPayment,
  canMutate,
  canApprovePayments = false,
  canSubmitDriverPayment = false,
  payments,
  audience = "staff",
  currentlyOwedGbp,
  headerMeta,
  onReload,
  onAllocationChange,
  busy = false,
}: {
  hireGroupId: string;
  items: HireDriverChargeWorkspaceRow[];
  outstandingGbp: number;
  pendingPayment?: {
    submissionId: string;
    amountGbp: number;
    paymentReference: string | null;
  } | null;
  canMutate: boolean;
  canApprovePayments?: boolean;
  canSubmitDriverPayment?: boolean;
  payments?: HirePaymentsPageData | null;
  audience?: "staff" | "driver";
  currentlyOwedGbp?: number | null;
  headerMeta?: string | null;
  onReload: () => void;
  onAllocationChange?: (rowIds: string[]) => void;
  busy?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [editing, setEditing] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [voiding, setVoiding] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [history, setHistory] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const pendingPaymentOpen = pendingPayment ?? null;
  const showActions = audience === "staff";
  const showRecordPayment =
    audience === "staff" &&
    Boolean(payments?.canSubmitPayment) &&
    (outstandingGbp > 0.005 || Boolean(pendingPaymentOpen));

  const rows = useMemo(
    () =>
      buildExtraChargePaymentTableRowsFromWorkspace({
        hireGroupId,
        items,
        outstandingGbp,
        pendingAmountGbp: pendingPaymentOpen?.amountGbp,
        allowMutate: canMutate,
      }),
    [canMutate, hireGroupId, items, outstandingGbp, pendingPaymentOpen?.amountGbp],
  );

  const addChargeHeaderMeta = useMemo(() => {
    const owed =
      currentlyOwedGbp != null && currentlyOwedGbp > 0.005
        ? `${formatGbp(currentlyOwedGbp)} currently owed`
        : null;
    const parts = [headerMeta?.trim() || null, owed].filter(Boolean);
    return parts.length ? parts.join(" · ").toUpperCase() : null;
  }, [currentlyOwedGbp, headerMeta]);

  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const res = await approveDriverExtraChargePaymentAction(hireGroupId);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      onReload();
    });
  }

  function handleReject() {
    const comment = rejectComment.trim();
    if (!comment) {
      setActionError("A reason is required when rejecting a payment.");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await rejectDriverExtraChargePaymentAction({ hireGroupId, comment });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setRejectOpen(false);
      setRejectComment("");
      onReload();
    });
  }

  if (!canMutate && !showRecordPayment && !canSubmitDriverPayment && items.length === 0 && outstandingGbp <= 0.005) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="driver-dash-section-label">Fees, damage and adjustments</p>
            <h2 className="mt-1 text-base font-semibold text-rph-fg">Extra charges</h2>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
              Each charge keeps its evidence, payment allocation and audit history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canMutate ? (
              <button
                type="button"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                onClick={() => setAddOpen(true)}
              >
                Add charge
              </button>
            ) : null}
            {showRecordPayment && payments ? (
              <HireAllocatedPaymentComposer
                hireGroupId={hireGroupId}
                payments={payments}
                asDriver={false}
                preferredAllocationKind="extra_charges"
                submitLabel="Record payment"
                triggerLabel="Record payment"
                triggerClassName="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg transition-colors hover:bg-rph-chrome disabled:pointer-events-none disabled:opacity-50"
                onAllocationChange={(rowIds) => {
                  setHighlightedRowIds(rowIds);
                  onAllocationChange?.(rowIds);
                }}
                onSuccess={onReload}
                busy={busy || pending}
              />
            ) : null}
          </div>
        </header>

        {actionError ? <p className="rph-alert-error mx-4 mt-3 text-sm sm:mx-5">{actionError}</p> : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center sm:px-5">
            <span
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
              aria-hidden
            >
              ✓
            </span>
            <p className="text-sm font-semibold text-rph-fg">No extra charges</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-rph-fg-secondary">
              Damage, administration fees and other adjustments will appear here when posted.
            </p>
            {canMutate ? (
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-4 text-sm font-medium text-rph-fg transition-colors hover:bg-rph-chrome"
                onClick={() => setAddOpen(true)}
              >
                Add first charge
              </button>
            ) : null}
          </div>
        ) : (
          <div className="hire-balance-rent-schedule-table">
            <div className="hire-ws-payments-table-wrap hire-balance-rent-schedule-table-wrap">
              <div className="hire-ws-payments-table-scroll">
                <table
                  className={
                    showActions
                      ? "hire-ws-payments-table"
                      : "hire-ws-payments-table hire-ws-payments-table-no-actions"
                  }
                >
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
                      <th scope="col">Charge</th>
                      <th scope="col">Scheduled</th>
                      <th scope="col">Adjustment</th>
                      <th scope="col">Charged</th>
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
                    {rows.map((row) => {
                      const source = items.find((item) => item.id === row.id) ?? null;
                      const chargeLabel = row.description
                        ? `${row.chargeTypeLabel} · ${row.description}`
                        : row.chargeTypeLabel;
                      const highlighted = highlightedRowIds.includes(row.id);
                      const balanceTone =
                        row.balanceGbp <= 0.005
                          ? "paid"
                          : row.status === "voided" || row.status === "waived"
                            ? "upcoming"
                            : "due";
                      return (
                        <tr
                          key={row.id}
                          className={highlighted ? "hire-ws-payments-table-row-highlight" : undefined}
                        >
                          <td data-label="Charge">
                            <span className="hire-ws-payments-period-label">{chargeLabel}</span>
                            <span className="mt-0.5 block text-xs text-rph-fg-secondary">
                              {formatUkDate(row.chargedOn || source?.createdAt || "")}
                            </span>
                            {highlighted ? (
                              <p className="mt-0.5 hidden text-[10px] font-medium text-rph-link sm:mt-1 sm:block sm:text-xs">
                                Allocated in payment
                              </p>
                            ) : null}
                          </td>
                          <td data-label="Scheduled" className="tabular-nums">
                            {formatGbp(row.dueGbp)}
                          </td>
                          <td data-label="Adjustment" className="tabular-nums">
                            {balanceRentScheduleAdjustmentLabel(row.adjustmentGbp)}
                          </td>
                          <td data-label="Charged" className="tabular-nums font-medium">
                            {formatGbp(row.chargedGbp)}
                          </td>
                          <td data-label="Paid" className="tabular-nums">
                            {formatGbp(row.paidGbp)}
                          </td>
                          <td
                            data-label="Balance"
                            className={`hire-ws-payments-balance-cell tabular-nums font-semibold ${
                              balanceTone === "paid"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : balanceTone === "upcoming"
                                  ? "text-rph-fg-muted"
                                  : "text-amber-800 dark:text-amber-200"
                            }`}
                          >
                            {formatGbp(row.balanceGbp)}
                          </td>
                          <td data-label="" className="hire-ws-payments-status-cell">
                            <span
                              className={`hire-ws-payments-status-pill ${extraChargePaymentStatusClass(row.statusTone)}`}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                          {showActions ? (
                            <td data-label="Actions" className="hire-ws-payments-table-actions">
                              <HireExtraChargeRowActions
                                row={row}
                                canMutate={canMutate}
                                canApprove={canApprovePayments}
                                busy={pending}
                                onHistory={() => source && setHistory(source)}
                                onEdit={() => source && setEditing(source)}
                                onVoid={() => source && setVoiding(source)}
                                onApprove={handleApprove}
                                onReject={() => {
                                  setActionError(null);
                                  setRejectComment("");
                                  setRejectOpen(true);
                                }}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div
          className="flex items-start gap-2.5 border-t border-rph-border bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 sm:px-5"
          role="note"
        >
          <span
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-700/40 text-[10px] font-bold text-amber-800 dark:border-amber-300/40 dark:text-amber-200"
            aria-hidden
          >
            i
          </span>
          <p>
            Posted financial records cannot be deleted. Use Void or Add adjustment to preserve the audit
            trail.
          </p>
        </div>
      </section>

      <HireAddChargeModal
        hireGroupId={hireGroupId}
        open={addOpen || Boolean(editing)}
        charge={editing}
        headerMeta={addChargeHeaderMeta}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={onReload}
      />
      <HireVoidChargeModal
        hireGroupId={hireGroupId}
        charge={voiding}
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        onVoided={onReload}
      />
      {history ? (
        <HireChargeHistoryModal
          hireGroupId={hireGroupId}
          chargeLineItemId={history.id}
          title={`${history.chargeTypeLabel} · ${formatGbp(history.amountGbp)}`}
          open
          onClose={() => setHistory(null)}
        />
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hire-extra-reject-title"
            className="relative z-[1] flex max-h-[min(90vh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rph-border bg-rph-elevated shadow-2xl"
          >
            <div className="shrink-0 border-b border-rph-border px-5 py-4 sm:px-6">
              <h2 id="hire-extra-reject-title" className="text-lg font-semibold text-rph-fg">
                Reject extra charge payment
              </h2>
              <p className="mt-1 text-sm text-rph-fg-secondary">
                The hirer will see your reason and can submit payment again.
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              {pendingPaymentOpen ? (
                <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
                  <p className="font-medium text-rph-fg">Extra charges</p>
                  <p className="rph-meta text-xs">Submitted {formatGbp(pendingPaymentOpen.amountGbp)}</p>
                </div>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Reason (required)</span>
                <textarea
                  className="rph-input min-h-[5rem] w-full text-sm"
                  placeholder="Explain why this payment is being rejected…"
                  value={rejectComment}
                  disabled={pending}
                  onChange={(e) => setRejectComment(e.target.value)}
                />
              </label>
              {actionError ? <p className="rph-alert-error text-sm">{actionError}</p> : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-rph-border px-5 py-4 sm:px-6">
              <button
                type="button"
                className="rph-btn-ghost h-10 px-4"
                disabled={pending}
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rph-btn-primary h-10 px-4"
                disabled={pending || !rejectComment.trim()}
                onClick={handleReject}
              >
                {pending ? "Rejecting…" : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
