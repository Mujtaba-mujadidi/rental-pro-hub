"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  clearStuckContractRenewalAction,
  getContractChangeRequestHistoryAction,
  prepareContractChangeRenewalEsignAction,
  reviewContractChangeRequestAction,
} from "@/app/actions/company-contract-change-review";
import { completeNewLegalEntityTransitionAction } from "@/app/actions/legal-entity-transition";
import { regeneratePlatformCompanyContractPdfAction } from "@/app/actions/esign";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import type {
  AdminContractChangeRequestRow,
  AdminStuckContractRenewalRow,
} from "@/lib/admin/contract-change-requests-query";
import {
  buildContractChangeHistoryEvents,
  formatContractChangeReviewStatus,
  formatContractChangeTransitionType,
  superAdminEsignDesignerHref,
  type ContractChangeHistoryRow,
} from "@/lib/admin/contract-change-display";
import type { ContractChangeDiffRow } from "@/lib/companies/contract-change-diff";
import { contractChangeDiffDisplayChangedRows } from "@/lib/companies/contract-change-diff";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { useContractChangeRealtime } from "@/hooks/use-contract-change-realtime";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

const rowActionTriggerClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:data-[state=open]:bg-slate-800";

const rowActionContentClass =
  "z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const rowActionItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800";

function IconKebabVertical() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

function formatDiffValue(key: ContractChangeDiffRow["key"], value: string): string {
  if (key === "primary_contact_dob" && value && value !== "—") {
    try {
      return formatUkDate(value);
    } catch {
      return value;
    }
  }
  return value;
}

function DiffTable({ rows }: { rows: ContractChangeDiffRow[] }) {
  const changedRows = contractChangeDiffDisplayChangedRows(rows);
  const substantiveRows = changedRows.filter((row) => row.changed);
  const formattingRows = changedRows.filter((row) => row.formattingOnly);

  if (!changedRows.length) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
        No differences from the current company record. Reject if this was submitted in error, or approve only if you
        need to re-issue the contract.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {formattingRows.length && !substantiveRows.length ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-100">
          Only spacing or formatting differs — legal values are unchanged. Highlighted rows show what the rental company
          edited.
        </p>
      ) : null}
      <div className="rph-table-responsive max-h-64 lg:overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Current</th>
              <th className="px-3 py-2 font-medium">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {changedRows.map((row) => (
              <tr
                key={row.key}
                className={`border-t border-rph-border ${
                  row.formattingOnly
                    ? "bg-sky-50/60 dark:bg-sky-950/20"
                    : "bg-amber-50/60 dark:bg-amber-950/20"
                }`}
              >
                <td data-label="Field" className="rph-table-primary px-3 py-2 font-medium text-rph-fg">
                  {row.label}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      row.formattingOnly
                        ? "bg-sky-200 text-sky-950 dark:bg-sky-900/60 dark:text-sky-100"
                        : "bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100"
                    }`}
                  >
                    {row.formattingOnly ? "Formatting" : "Changed"}
                  </span>
                </td>
                <td data-label="Current" className="px-3 py-2 text-rph-fg-secondary">
                  <span className="rph-table-cell-value">{formatDiffValue(row.key, row.before)}</span>
                </td>
                <td
                  data-label="Proposed"
                  className={`px-3 py-2 ${
                    row.changed
                      ? "font-semibold text-amber-900 dark:text-amber-100"
                      : "font-medium text-sky-900 dark:text-sky-100"
                  }`}
                >
                  <span className="rph-table-cell-value">{formatDiffValue(row.key, row.after)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequestActionsMenu({
  row,
  busy,
  onReview,
  onHistory,
  onPrepareContract,
  onRegenerateContract,
  onCompleteNewEntity,
}: {
  row: AdminContractChangeRequestRow;
  busy: boolean;
  onReview: () => void;
  onHistory: () => void;
  onPrepareContract: () => void;
  onRegenerateContract: () => void;
  onCompleteNewEntity: () => void;
}) {
  const isDetailChange = row.transition_type === "detail_change";
  const awaitingSignature = row.review_status === "awaiting_signature" || row.review_status === "approved";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={rowActionTriggerClass}
          disabled={busy}
          aria-label="Request actions"
          title="Actions"
        >
          <IconKebabVertical />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={rowActionContentClass}>
          <DropdownMenu.Item className={rowActionItemClass} onSelect={onReview}>
            Review changes
          </DropdownMenu.Item>
          <DropdownMenu.Item className={rowActionItemClass} onSelect={onHistory}>
            History
          </DropdownMenu.Item>

          {isDetailChange && awaitingSignature ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
              {row.esign_envelope_id ? (
                <>
                  <DropdownMenu.Item className={rowActionItemClass} asChild>
                    <Link href={superAdminEsignDesignerHref(row.esign_envelope_id, true)}>
                      Open e-sign designer
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={rowActionItemClass} onSelect={onRegenerateContract}>
                    Regenerate contract PDF
                  </DropdownMenu.Item>
                </>
              ) : (
                <DropdownMenu.Item className={rowActionItemClass} onSelect={onPrepareContract}>
                  Prepare contract for e-sign
                </DropdownMenu.Item>
              )}
            </>
          ) : null}

          {!isDetailChange && awaitingSignature ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
              <DropdownMenu.Item
                className={rowActionItemClass}
                onSelect={onCompleteNewEntity}
              >
                Complete new legal entity
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ReviewModal({
  row,
  busy,
  onClose,
  onApproveDetailChange,
  onApproveNewEntity,
  onRequestReject,
}: {
  row: AdminContractChangeRequestRow;
  busy: boolean;
  onClose: () => void;
  onApproveDetailChange: () => void;
  onApproveNewEntity: () => void;
  onRequestReject: () => void;
}) {
  const isDetailChange = row.transition_type === "detail_change";
  const awaitingSignature = row.review_status === "awaiting_signature" || row.review_status === "approved";
  const signatoryLabel =
    row.resolvedSignatoryName || row.resolvedSignatoryEmail
      ? [row.resolvedSignatoryName, row.resolvedSignatoryEmail].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {row.companyName ?? row.proposed_name ?? "Agreement change request"}
          </h3>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            {formatContractChangeTransitionType(row.transition_type)} ·{" "}
            {formatContractChangeReviewStatus(row.review_status)} · submitted {formatUkDateTime(row.created_at)}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What will change</h4>
            <div className="mt-2">
              <DiffTable rows={row.diff} />
            </div>
          </div>

          {signatoryLabel ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contract signatory (owner by default):{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">{signatoryLabel}</span>
            </p>
          ) : null}

          {isDetailChange && awaitingSignature ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Place signature fields, countersign as platform owner, then send. Legal details update automatically when
              the rental company signs.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>

          {row.review_status === "pending_review" && isDetailChange ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-rph-rail px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={onApproveDetailChange}
            >
              {busy ? "Approving…" : "Approve & prepare contract"}
            </button>
          ) : null}

          {row.review_status === "pending_review" && !isDetailChange ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-rph-rail px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={onApproveNewEntity}
            >
              {busy ? "Approving…" : "Approve transition"}
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:text-red-200"
            onClick={onRequestReject}
          >
            Reject…
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({
  companyName,
  rows,
  loading,
  error,
  onClose,
}: {
  companyName: string;
  rows: ContractChangeHistoryRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[min(88vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Request history</h3>
          <p className="mt-1 text-sm text-rph-fg-secondary">{companyName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? <p className="text-sm text-slate-500">Loading history…</p> : null}
          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="text-sm text-slate-500">No prior requests for this company.</p>
          ) : null}
          {!loading && !error && rows.length > 0 ? (
            <div className="space-y-5">
              {rows.map((row) => {
                const events = buildContractChangeHistoryEvents(row);
                return (
                  <div key={row.id} className="rounded-lg border border-rph-border bg-rph-raised p-3">
                    <p className="text-sm font-semibold text-rph-fg">
                      {formatContractChangeTransitionType(row.transition_type)}
                    </p>
                    <p className="text-xs text-rph-fg-muted">
                      Submitted {formatUkDateTime(row.created_at)} · {formatContractChangeReviewStatus(row.review_status)}
                    </p>
                    <ul className="mt-3 space-y-2 border-l-2 border-rph-border pl-3">
                      {events.map((event, index) => (
                        <li key={`${row.id}-${index}`} className="text-sm">
                          <p className="font-medium text-rph-fg">{event.label}</p>
                          <p className="text-xs text-rph-fg-muted">{formatUkDateTime(event.at)}</p>
                          {event.detail ? (
                            <p className="mt-0.5 text-xs text-rph-fg-secondary">{event.detail}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContractChangesClient({
  openRequests,
  stuckRenewals,
}: {
  openRequests: AdminContractChangeRequestRow[];
  stuckRenewals: AdminStuckContractRenewalRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionOverlay, setActionOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviewRow, setReviewRow] = useState<AdminContractChangeRequestRow | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [historyState, setHistoryState] = useState<{
    companyName: string;
    rows: ContractChangeHistoryRow[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    | { kind: "complete_new_entity"; changeId: string }
    | { kind: "clear_renewal"; companyId: string; companyName: string | null }
    | null
  >(null);

  const actionBusy = actionOverlay?.phase === "pending";
  const busy = pending || actionBusy;

  const finishActionOverlay = useCallback(
    (next: ActionStatusOverlayState, refreshAfterSuccess?: boolean) => {
      setActionOverlay(next);
      if (next.phase === "success") {
        if (refreshAfterSuccess) {
          startTransition(() => {
            router.refresh();
          });
        }
        window.setTimeout(() => setActionOverlay(null), 2200);
      }
    },
    [router, startTransition],
  );

  const approveDetailChange = useCallback(
    async (changeId: string) => {
      setErr(null);
      setMsg(null);
      setActionOverlay({
        phase: "pending",
        title: "Approving change request…",
        detail: "Creating the renewal contract and e-sign envelope. This may take a moment.",
      });
      const fd = new FormData();
      fd.set("change_id", changeId);
      fd.set("decision", "approve");
      const res = await reviewContractChangeRequestAction(fd);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Could not approve change",
          detail: res.error,
        });
        return;
      }
      setReviewRow(null);
      if (res.envelopeId) {
        setActionOverlay({
          phase: "pending",
          title: "Opening e-sign designer…",
          detail: "Renewal contract prepared. Redirecting you now.",
        });
        router.push(superAdminEsignDesignerHref(res.envelopeId, true));
        window.setTimeout(() => setActionOverlay(null), 800);
        return;
      }
      finishActionOverlay(
        {
          phase: "success",
          title: "Change approved",
          detail: "The rental company can proceed with renewal.",
        },
        true,
      );
    },
    [finishActionOverlay, router],
  );

  const regenerateContract = useCallback(
    async (envelopeId: string) => {
      setErr(null);
      setMsg(null);
      setActionOverlay({
        phase: "pending",
        title: "Regenerating contract…",
        detail: "Rebuilding the unsigned agreement PDF from the latest data.",
      });
      const res = await regeneratePlatformCompanyContractPdfAction(envelopeId);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Could not regenerate contract",
          detail: res.error,
        });
        return;
      }
      finishActionOverlay(
        {
          phase: "success",
          title: "Contract regenerated",
          detail: "Owner signature was cleared — review placement and sign again before sending.",
        },
        true,
      );
    },
    [finishActionOverlay],
  );

  const approveNewEntity = useCallback(
    async (changeId: string) => {
      setErr(null);
      setMsg(null);
      setActionOverlay({
        phase: "pending",
        title: "Approving transition…",
        detail: "Recording your approval for the new legal entity request.",
      });
      const fd = new FormData();
      fd.set("change_id", changeId);
      fd.set("decision", "approve");
      const res = await reviewContractChangeRequestAction(fd);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Could not approve transition",
          detail: res.error,
        });
        return;
      }
      setReviewRow(null);
      finishActionOverlay(
        {
          phase: "success",
          title: "Transition approved",
          detail: "Complete the new legal entity when you are ready.",
        },
        true,
      );
    },
    [finishActionOverlay],
  );

  const prepareContract = useCallback(
    async (changeId: string) => {
      setErr(null);
      setMsg(null);
      setActionOverlay({
        phase: "pending",
        title: "Preparing contract…",
        detail: "Generating the renewal contract and e-sign envelope.",
      });
      const res = await prepareContractChangeRenewalEsignAction(changeId);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Could not prepare contract",
          detail: res.error,
        });
        return;
      }
      setActionOverlay({
        phase: "pending",
        title: "Opening e-sign designer…",
        detail: "Renewal contract prepared. Redirecting you now.",
      });
      router.push(superAdminEsignDesignerHref(res.envelopeId, true));
      window.setTimeout(() => setActionOverlay(null), 800);
    },
    [router],
  );

  const completeNewEntity = useCallback(
    async (changeId: string) => {
      setErr(null);
      setMsg(null);
      setActionOverlay({
        phase: "pending",
        title: "Creating new legal entity…",
        detail: "Migrating memberships to the new parent company. Please wait.",
      });
      const res = await completeNewLegalEntityTransitionAction(changeId);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Could not complete transition",
          detail: res.error,
        });
        return;
      }
      setReviewRow(null);
      finishActionOverlay(
        {
          phase: "success",
          title: "New entity created",
          detail: res.newCompanyId ? `New company id: ${res.newCompanyId}` : "Migration completed.",
        },
        true,
      );
    },
    [finishActionOverlay],
  );

  const openHistory = useCallback((row: AdminContractChangeRequestRow) => {
    setHistoryState({
      companyName: row.companyName ?? row.proposed_name ?? "Company",
      rows: [],
      loading: true,
      error: null,
    });
    void (async () => {
      const res = await getContractChangeRequestHistoryAction(row.parent_company_id);
      setHistoryState((prev) => {
        if (!prev) return prev;
        if (!res.ok) {
          return { ...prev, loading: false, error: res.error };
        }
        return { ...prev, loading: false, rows: res.rows };
      });
    })();
  }, []);

  useContractChangeRealtime(() => {
    router.refresh();
  });

  function submitReject() {
    if (!rejectId) return;
    if (!rejectComment.trim()) {
      setErr("A rejection reason is required.");
      return;
    }
    setErr(null);
    setMsg(null);
    const fd = new FormData();
    fd.set("change_id", rejectId);
    fd.set("decision", "reject");
    fd.set("comment", rejectComment.trim());
    startTransition(() => {
      void (async () => {
        const res = await reviewContractChangeRequestAction(fd);
        if (!res.ok) setErr(res.error);
        else {
          setMsg("Request rejected. The rental company will see your reason.");
          setRejectId(null);
          setRejectComment("");
          setReviewRow(null);
          router.refresh();
        }
      })();
    });
  }

  if (!openRequests.length && !stuckRenewals.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No open agreement change requests.</p>;
  }

  return (
    <div className="space-y-6">
      {openRequests.length ? (
        <div className="rph-table-responsive">
          <table className="min-w-full text-sm">
            <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openRequests.map((r) => (
                <tr key={r.id} className="border-t border-rph-border bg-rph-raised">
                  <td data-label="Company" className="rph-table-primary px-4 py-3 font-medium text-rph-fg">
                    {r.companyName ?? r.proposed_name ?? "—"}
                  </td>
                  <td data-label="Type" className="px-4 py-3 text-rph-fg-secondary">
                    <span className="rph-table-cell-value">{formatContractChangeTransitionType(r.transition_type)}</span>
                  </td>
                  <td data-label="Status" className="px-4 py-3 text-rph-fg-secondary">
                    <span className="rph-table-cell-value">{formatContractChangeReviewStatus(r.review_status)}</span>
                  </td>
                  <td data-label="Submitted" className="px-4 py-3 text-rph-fg-secondary">
                    <span className="rph-table-cell-value">{formatUkDateTime(r.created_at)}</span>
                  </td>
                  <td data-label="" className="rph-table-actions px-4 py-3">
                    <div className="flex justify-end">
                      <RequestActionsMenu
                        row={r}
                        busy={busy}
                        onReview={() => setReviewRow(r)}
                        onHistory={() => openHistory(r)}
                        onPrepareContract={() => {
                          void prepareContract(r.id);
                        }}
                        onRegenerateContract={() => {
                          if (r.esign_envelope_id) void regenerateContract(r.esign_envelope_id);
                        }}
                        onCompleteNewEntity={() => {
                          setConfirmDialog({ kind: "complete_new_entity", changeId: r.id });
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {stuckRenewals.length ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stuck renewal flags</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            These companies show renewal pending without an open request row.
          </p>
          <div className="rph-table-responsive border-amber-200 dark:border-amber-900/50">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stuckRenewals.map((row) => (
                  <tr key={row.companyId} className="border-t border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <td data-label="Company" className="rph-table-primary px-4 py-3 font-medium text-amber-950 dark:text-amber-100">
                      {row.companyName ?? "Unnamed company"}
                    </td>
                    <td data-label="Status" className="px-4 py-3 text-amber-900 dark:text-amber-100">
                      <span className="rph-table-cell-value">Renewal pending</span>
                    </td>
                    <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                        onClick={() => {
                          setConfirmDialog({
                            kind: "clear_renewal",
                            companyId: row.companyId,
                            companyName: row.companyName,
                          });
                        }}
                      >
                        Clear renewal lock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {err ? <p className="rph-alert-error text-sm">{err}</p> : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
          {msg}
        </p>
      ) : null}

      {reviewRow ? (
        <ReviewModal
          row={reviewRow}
          busy={busy}
          onClose={() => setReviewRow(null)}
          onApproveDetailChange={() => {
            void approveDetailChange(reviewRow.id);
          }}
          onApproveNewEntity={() => {
            void approveNewEntity(reviewRow.id);
          }}
          onRequestReject={() => {
            setErr(null);
            setMsg(null);
            setRejectComment("");
            setRejectId(reviewRow.id);
          }}
        />
      ) : null}

      {historyState ? (
        <HistoryModal
          companyName={historyState.companyName}
          rows={historyState.rows}
          loading={historyState.loading}
          error={historyState.error}
          onClose={() => setHistoryState(null)}
        />
      ) : null}

      {rejectId ? (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reject change request</h3>
            <p className="mt-1 text-sm text-rph-fg-secondary">
              Explain what the rental company should correct. This is shown on their{" "}
              {rentalContractCopy.platformAgreementNav} page. You can reject after approval — any draft contract and
              e-sign envelope will be voided.
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              placeholder="Rejection reason (required)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                disabled={busy}
                onClick={() => {
                  setRejectId(null);
                  setRejectComment("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={submitReject}
              >
                {pending ? "Rejecting…" : "Reject request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ActionStatusOverlay state={actionOverlay} onDismiss={() => setActionOverlay(null)} />

      <ConfirmDialog
        open={confirmDialog?.kind === "complete_new_entity"}
        title="Create new parent company?"
        description="This migrates all memberships from the old tenant to the new parent company. This cannot be undone from this screen."
        confirmLabel="Create and migrate"
        variant="danger"
        pending={busy}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (confirmDialog?.kind !== "complete_new_entity") return;
          const changeId = confirmDialog.changeId;
          setConfirmDialog(null);
          void completeNewEntity(changeId);
        }}
      />

      <ConfirmDialog
        open={confirmDialog?.kind === "clear_renewal"}
        title="Clear renewal lock?"
        description={`Clear renewal pending for ${confirmDialog?.kind === "clear_renewal" ? (confirmDialog.companyName ?? "this company") : "this company"}?`}
        confirmLabel="Clear lock"
        pending={busy}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (confirmDialog?.kind !== "clear_renewal") return;
          const companyId = confirmDialog.companyId;
          setConfirmDialog(null);
          setErr(null);
          setMsg(null);
          startTransition(() => {
            void (async () => {
              const res = await clearStuckContractRenewalAction(companyId);
              if (!res.ok) setErr(res.error);
              else {
                setMsg("Renewal lock cleared.");
                router.refresh();
              }
            })();
          });
        }}
      />
    </div>
  );
}
