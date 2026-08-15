"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  listHireContractsAction,
  type HireContractTableRow,
} from "@/app/actions/rental-hire-wizard";
import {
  cancelHireGroupAction,
  ensureHireGroupEnvelopesPreparedAction,
  loadHireGroupAuditTrailAction,
  regenerateHireGroupContractsAction,
} from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { HireContractWizardModal } from "@/app/(main)/rental/hires/hire-contract-wizard-modal";
import { HireContractRowActionsMenu } from "@/app/(main)/rental/hires/hire-contract-row-actions-menu";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import {
  hireCancelConfirmCopy,
  hireRegenerateContractsConfirmCopy,
  type HireGroupAuditRow,
} from "@/lib/fleet/hire-audit";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import {
  buildSubcompanyHiresStats,
  isSubcompanyCurrentHireStatus,
  subcompanyHireAgreementBadge,
  subcompanyHireDriverLabel,
  subcompanyHirePeriodLabel,
  subcompanyHireRentLabel,
  subcompanyHireStatusBadge,
} from "@/lib/rental/subcompany-hires-display";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

function StatusPill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function statusPillClass(tone: "active" | "scheduled" | "other", tableTone: string): string {
  if (tone === "active") {
    return "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-100";
  }
  if (tone === "scheduled") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950/45 dark:text-amber-100";
  }
  return hireTableStatusToneClass(tableTone as "neutral" | "pending" | "success" | "warning" | "error");
}

export function SubcompanyHiresClient({
  initialRows,
  initialCanWrite,
  incomeThisMonthGbp,
}: {
  initialRows: HireContractTableRow[];
  initialCanWrite: boolean;
  incomeThisMonthGbp: number;
}) {
  const { shell } = useSubcompanyWorkspace();
  const subcompanyId = shell.subcompany.id;
  const [rows, setRows] = useState(initialRows);
  const [canWrite, setCanWrite] = useState(initialCanWrite);
  const [incomeGbp, setIncomeGbp] = useState(incomeThisMonthGbp);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTitle, setAuditTitle] = useState("Hire contract audit");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<HireGroupAuditRow[]>([]);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<HireContractTableRow | null>(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<HireContractTableRow | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await listHireContractsAction("", undefined, subcompanyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.rows);
      setCanWrite(res.canWrite);
      setError(null);
    });
  }, [subcompanyId]);

  useHireContractsRealtime(reload);

  useEffect(() => {
    setIncomeGbp(incomeThisMonthGbp);
  }, [incomeThisMonthGbp]);

  const scopedRows = rows;

  const currentRows = useMemo(
    () => scopedRows.filter((r) => isSubcompanyCurrentHireStatus(r.status)),
    [scopedRows],
  );

  const stats = useMemo(
    () => buildSubcompanyHiresStats(scopedRows, incomeGbp),
    [scopedRows, incomeGbp],
  );

  const busy = pending || actionPending || overlay?.phase === "pending";

  function openNew() {
    setEditDraftId(null);
    setWizardOpen(true);
  }

  function openDraft(id: string) {
    setEditDraftId(id);
    setWizardOpen(true);
  }

  const openAudit = useCallback((row: HireContractTableRow) => {
    const label =
      [row.vehicle_vrm, row.driver_name ?? row.driver_email].filter(Boolean).join(" · ") ||
      "Hire contract";
    setAuditTitle(`${label} — audit trail`);
    setAuditEvents([]);
    setAuditError(null);
    setAuditOpen(true);
    setAuditLoading(true);
    void loadHireGroupAuditTrailAction(row.id).then((res) => {
      setAuditLoading(false);
      if (!res.ok) {
        setAuditError(res.error);
        return;
      }
      setAuditEvents(res.events);
    });
  }, []);

  function prepareForSignature(row: HireContractTableRow) {
    // Open the tab on the click gesture so popup blockers allow navigation after prepare.
    const esignTab = window.open("about:blank", "_blank");
    setOverlay({
      phase: "pending",
      title: "Preparing documents for e-signature…",
      detail: "Creating the contract PDF and opening the e-sign designer.",
    });
    startAction(async () => {
      const res = await ensureHireGroupEnvelopesPreparedAction(row.id);
      if (!res.ok) {
        esignTab?.close();
        setOverlay({ phase: "error", title: "Could not prepare documents", detail: res.error });
        return;
      }
      reload();
      const url = `/rental/esign/${res.firstEnvelopeId}`;
      if (esignTab) {
        esignTab.opener = null;
        esignTab.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setOverlay(null);
    });
  }

  function sendForSignature(row: HireContractTableRow) {
    setOverlay({
      phase: "pending",
      title: row.signing_bundle_sent_at ? "Resending for signature…" : "Sending for signature…",
      detail: "Emailing the signing bundle to the hirer.",
    });
    startAction(async () => {
      const res = await sendHireGroupSigningBundleAction(row.id, {
        resend: Boolean(row.signing_bundle_sent_at),
      });
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Action failed", detail: res.error });
        return;
      }
      setOverlay({
        phase: "success",
        title: row.signing_bundle_sent_at ? "Signing email resent" : "Sent for signature",
        detail: "The hirer will receive an email with signing links.",
      });
      reload();
    });
  }

  const cancelCopy = cancelTarget ? hireCancelConfirmCopy(cancelTarget.vehicle_vrm) : "";
  const regenerateCopy = regenerateTarget
    ? hireRegenerateContractsConfirmCopy(Boolean(regenerateTarget.signing_bundle_sent_at))
    : "";

  return (
    <div className="subco-hires space-y-4 sm:space-y-5">
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="rph-card overflow-hidden p-0">
        <dl className="grid grid-cols-1 divide-y divide-rph-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-rph-fg-muted">Active hires</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.activeCount.toLocaleString("en-GB")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-rph-fg-muted">Scheduled</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.scheduledCount.toLocaleString("en-GB")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-rph-fg-muted">Completed this month</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.completedThisMonthCount.toLocaleString("en-GB")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-rph-fg-muted">Hire income this month</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.incomeThisMonthLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rph-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-rph-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="company-dash-section-label">Current agreements</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">Active & scheduled hires</h2>
          </div>
          {canWrite || shell.canWriteRentals ? (
            <button
              type="button"
              className="rph-btn-primary shrink-0"
              disabled={busy}
              onClick={openNew}
            >
              Create hire
            </button>
          ) : null}
        </div>

        {!currentRows.length ? (
          <p className="px-4 py-8 text-sm text-rph-fg-muted sm:px-5">
            No active or scheduled hires yet.
            {canWrite || shell.canWriteRentals ? " Create a hire to get started." : ""}
          </p>
        ) : (
          <div className="rph-table-responsive subco-fleet-table">
            <table className="min-w-full divide-y divide-rph-border text-sm">
              <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Driver</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Rent</th>
                  <th className="px-4 py-3 font-semibold">Agreement</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {currentRows.map((row) => {
                  const agreement = subcompanyHireAgreementBadge(row);
                  const status = subcompanyHireStatusBadge(row.status);
                  const href = `/rental/hires/${row.id}`;
                  return (
                    <tr key={row.id} className="bg-rph-raised">
                      <td data-label="Vehicle" className="rph-table-primary px-4 py-3">
                        <Link
                          href={href}
                          className="block hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="font-mono font-semibold text-rph-fg">
                            {row.vehicle_vrm ?? "—"}
                          </span>
                          {row.vehicle_label ? (
                            <span className="mt-0.5 block text-xs text-rph-fg-muted">
                              {row.vehicle_label}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td data-label="Driver" className="px-4 py-3 text-rph-fg-secondary">
                        {subcompanyHireDriverLabel(row)}
                      </td>
                      <td data-label="Period" className="px-4 py-3 text-rph-fg-secondary">
                        {subcompanyHirePeriodLabel(row)}
                      </td>
                      <td data-label="Rent" className="px-4 py-3 text-rph-fg-secondary">
                        {subcompanyHireRentLabel(row)}
                      </td>
                      <td data-label="Agreement" className="px-4 py-3">
                        <StatusPill
                          label={agreement.label}
                          className={
                            agreement.tone === "success"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100"
                              : "bg-amber-100 text-amber-900 dark:bg-amber-950/45 dark:text-amber-100"
                          }
                        />
                      </td>
                      <td data-label="Status" className="px-4 py-3">
                        <StatusPill
                          label={status.label}
                          className={statusPillClass(status.tone, status.tableTone)}
                        />
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <HireContractRowActionsMenu
                          row={row}
                          canWrite={canWrite}
                          disabled={busy}
                          openInNewTab
                          onAudit={() => openAudit(row)}
                          onContinue={() => openDraft(row.id)}
                          onPrepareForSignature={() => prepareForSignature(row)}
                          onSendForSignature={() => sendForSignature(row)}
                          onRegenerateContracts={() => {
                            setRegenerateTarget(row);
                            setRegenerateConfirmOpen(true);
                          }}
                          onCancel={() => {
                            setCancelTarget(row);
                            setCancelConfirmOpen(true);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <HireContractWizardModal
        open={wizardOpen}
        hireGroupId={editDraftId}
        onClose={() => {
          setWizardOpen(false);
          setEditDraftId(null);
          reload();
        }}
        onSaved={reload}
      />

      <HireGroupAuditModal
        open={auditOpen}
        title={auditTitle}
        loading={auditLoading}
        error={auditError}
        events={auditEvents}
        onClose={() => {
          if (auditLoading) return;
          setAuditOpen(false);
        }}
      />

      <ConfirmDialog
        open={cancelConfirmOpen && Boolean(cancelTarget)}
        title="Cancel hire contract?"
        description={cancelCopy}
        confirmLabel="Cancel contract"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onConfirm={() => {
          if (!cancelTarget) return;
          startAction(async () => {
            const res = await cancelHireGroupAction(cancelTarget.id);
            setCancelConfirmOpen(false);
            setCancelTarget(null);
            if (!res.ok) {
              setOverlay({ phase: "error", title: "Could not cancel", detail: res.error });
              return;
            }
            reload();
          });
        }}
        onCancel={() => {
          if (actionPending) return;
          setCancelConfirmOpen(false);
          setCancelTarget(null);
        }}
      />

      <ConfirmDialog
        open={regenerateConfirmOpen && Boolean(regenerateTarget)}
        title="Discard layout and regenerate contracts?"
        description={regenerateCopy}
        confirmLabel="Regenerate contracts"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onConfirm={() => {
          if (!regenerateTarget) return;
          startAction(async () => {
            const res = await regenerateHireGroupContractsAction(regenerateTarget.id);
            setRegenerateConfirmOpen(false);
            setRegenerateTarget(null);
            if (!res.ok) {
              setOverlay({ phase: "error", title: "Could not regenerate", detail: res.error });
              return;
            }
            setOverlay({
              phase: "success",
              title: "Contracts regenerated",
              detail: "Updated PDFs are ready for this hire.",
            });
            reload();
          });
        }}
        onCancel={() => {
          if (actionPending) return;
          setRegenerateConfirmOpen(false);
          setRegenerateTarget(null);
        }}
      />

      <ActionStatusOverlay
        state={overlay}
        onDismiss={() => setOverlay(null)}
      />
    </div>
  );
}
