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
import { HireDeleteChargeModal } from "@/components/fleet/hire-charges/hire-delete-charge-modal";
import { HireExtraChargeRowActions } from "@/components/fleet/hire-charges/hire-extra-charge-row-actions";
import { HireAllocatedPaymentComposer } from "@/components/fleet/hire-payments/hire-allocated-payment-composer";
import { formatUkDate } from "@/lib/datetime/uk";
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
  onReload: () => void;
  onAllocationChange?: (rowIds: string[]) => void;
  busy?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [editing, setEditing] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [deleting, setDeleting] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [history, setHistory] = useState<HireDriverChargeWorkspaceRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const pendingPaymentOpen = pendingPayment ?? null;
  const showActions = audience === "staff";
  const showRecordPayment = audience === "staff" && Boolean(payments?.canSubmitPayment);

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

  const subtitle = pendingPaymentOpen
    ? `${formatGbp(pendingPaymentOpen.amountGbp)} submitted and waiting for approval.`
    : outstandingGbp > 0.005
      ? `${formatGbp(outstandingGbp)} still outstanding.`
      : "No outstanding extra charges.";

  return (
    <section className="hire-ws-payments-panel">
      <header className="hire-ws-payments-panel-header flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-rph-fg">Extra charges</h2>
          <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canMutate ? (
            <button type="button" className="rph-btn-ghost h-9 px-3 text-sm" onClick={() => setAddOpen(true)}>
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

      {actionError ? <p className="rph-alert-error mx-4 mt-3 text-sm">{actionError}</p> : null}

      <div className="hire-ws-payments-table-wrap">
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-y-contain">
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
              <th scope="col">Charge</th>
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
                <td colSpan={showActions ? 8 : 7} className="hire-ws-payments-table-empty">
                  No extra charges recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const source = items.find((item) => item.id === row.id) ?? null;
                const chargeLabel = row.description
                  ? `${row.chargeTypeLabel} · ${row.description}`
                  : row.chargeTypeLabel;
                const highlighted = highlightedRowIds.includes(row.id);
                return (
                  <tr key={row.id} className={highlighted ? "hire-ws-payments-table-row-highlight" : undefined}>
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
                    <td data-label="Due" className="tabular-nums">
                      {formatGbp(row.dueGbp)}
                    </td>
                    <td data-label="Discount" className="tabular-nums">
                      —
                    </td>
                    <td data-label="After discount" className="tabular-nums font-medium">
                      {formatGbp(row.dueGbp)}
                    </td>
                    <td data-label="Paid" className="tabular-nums">
                      {formatGbp(row.paidGbp)}
                    </td>
                    <td data-label="Balance" className="tabular-nums font-medium">
                      {formatGbp(row.balanceGbp)}
                    </td>
                    <td data-label="Status">
                      <span className={`hire-ws-payments-status-pill ${extraChargePaymentStatusClass(row.statusTone)}`}>
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
                          onDelete={() => source && setDeleting(source)}
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
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      <HireAddChargeModal
        hireGroupId={hireGroupId}
        open={addOpen || Boolean(editing)}
        charge={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={onReload}
      />
      <HireDeleteChargeModal
        hireGroupId={hireGroupId}
        charge={deleting}
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onDeleted={onReload}
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
    </section>
  );
}
