"use client";

import { formatHireContractEndLabel, formatHireContractStartLabel } from "@/lib/fleet/hire-pdf-details";
import { formatUkDateTimeSeconds } from "@/lib/datetime/uk";
import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { cancelHireGroupAction, ensureHireGroupEnvelopesPreparedAction, loadHireGroupAuditTrailAction, regenerateHireGroupContractsAction } from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { hireTableStatusToneClass, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { hireCancelConfirmCopy, hireRegenerateContractsConfirmCopy, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { HireContractRowActionsMenu } from "./hire-contract-row-actions-menu";

type Props = {
  rows: HireContractTableRow[];
  canWrite: boolean;
  onOpenDraft: (id: string) => void;
  onNewContract: () => void;
  onRefresh: () => void;
  busy?: boolean;
  /** When set, hide vehicle column (vehicle workspace rentals tab). */
  vehicleScoped?: boolean;
};

function statusLabel(row: HireContractTableRow): string {
  if (row.status === "draft") return `Draft · step ${row.wizard_step}`;
  return row.status.replace(/_/g, " ");
}

function startLabel(row: HireContractTableRow): string {
  if (row.activated_at) return formatUkDateTimeSeconds(row.activated_at);
  if (row.start_date) {
    return `Scheduled ${formatHireContractStartLabel(row.start_date, row.start_time)}`;
  }
  return "—";
}

function endLabel(row: HireContractTableRow): string {
  if (row.terminated_at) return formatUkDateTimeSeconds(row.terminated_at);
  if (row.scheduled_end_date) {
    return formatHireContractEndLabel(row.scheduled_end_date, row.end_time);
  }
  return "—";
}

function WorkflowStatusPill({ label, tone }: { label: string; tone: HireTableStatusTone }) {
  if (label === "—") return <span className="text-rph-fg-muted">—</span>;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}>
      {label}
    </span>
  );
}

type RowActionsProps = {
  row: HireContractTableRow;
  canWrite: boolean;
  disabled: boolean;
  onAudit: () => void;
  onContinue: () => void;
  onPrepareForSignature: () => void;
  onSendForSignature: () => void;
  onRegenerateContracts: () => void;
  onCancel: () => void;
};

function HireContractMobileCard({
  row,
  vehicleScoped,
  actions,
}: {
  row: HireContractTableRow;
  vehicleScoped?: boolean;
  actions: RowActionsProps;
}) {
  const title = vehicleScoped ? row.driver_label ?? "Hire contract" : row.vehicle_vrm ?? "—";
  const subtitle = vehicleScoped
    ? null
    : [row.vehicle_label, row.driver_label].filter(Boolean).join(" · ") || null;

  return (
    <article className="rph-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {row.status !== "draft" ? (
            <Link href={`/rental/hires/${row.id}`} className="font-semibold text-rph-link hover:text-rph-link-hover">
              {title}
            </Link>
          ) : (
            <p className="font-semibold text-rph-fg">{title}</p>
          )}
          {subtitle ? <p className="mt-0.5 text-sm text-rph-fg-secondary">{subtitle}</p> : null}
          <div className="mt-2">
            <span className="rph-pill capitalize">{statusLabel(row)}</span>
          </div>
        </div>
        <HireContractRowActionsMenu {...actions} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Started</dt>
          <dd className="mt-0.5 text-rph-fg-secondary">{startLabel(row)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Ended</dt>
          <dd className="mt-0.5 text-rph-fg-secondary">{endLabel(row)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Rent</dt>
          <dd className="mt-0.5 text-rph-fg-secondary">
            {row.rent_amount_gbp > 0 ? `£${row.rent_amount_gbp.toFixed(2)} / ${row.rent_cadence}` : "—"}
          </dd>
        </div>
        {row.lifecycle_label ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Workflow</dt>
            <dd className="mt-1">
              <WorkflowStatusPill label={row.lifecycle_label} tone={row.lifecycle_tone} />
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-rph-border pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">Driver access</span>
          <WorkflowStatusPill label={row.driver_access_label} tone={row.driver_access_tone} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">E-sign</span>
          <WorkflowStatusPill label={row.esign_label} tone={row.esign_tone} />
        </div>
      </div>
    </article>
  );
}

function rowActionsProps(
  row: HireContractTableRow,
  canWrite: boolean,
  tableBusy: boolean,
  handlers: {
    openAudit: (row: HireContractTableRow) => void;
    onOpenDraft: (id: string) => void;
    prepareForSignature: (row: HireContractTableRow) => void;
    onSendForSignature: (row: HireContractTableRow) => void;
    openRegenerateConfirm: (row: HireContractTableRow) => void;
    openCancelConfirm: (row: HireContractTableRow) => void;
  },
): RowActionsProps {
  return {
    row,
    canWrite,
    disabled: tableBusy,
    onAudit: () => handlers.openAudit(row),
    onContinue: () => handlers.onOpenDraft(row.id),
    onPrepareForSignature: () => handlers.prepareForSignature(row),
    onSendForSignature: () => handlers.onSendForSignature(row),
    onRegenerateContracts: () => handlers.openRegenerateConfirm(row),
    onCancel: () => handlers.openCancelConfirm(row),
  };
}

export function HireContractsTable({
  rows,
  canWrite,
  onOpenDraft,
  onNewContract,
  onRefresh,
  busy,
  vehicleScoped,
}: Props) {
  const [search, setSearch] = useState("");
  const [actionPending, startAction] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTitle, setAuditTitle] = useState("Hire contract audit");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<HireGroupAuditRow[]>([]);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<HireContractTableRow | null>(null);

  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<HireContractTableRow | null>(null);
  const [overlay, setOverlay] = useState<ActionStatusOverlayState | null>(null);

  const openAudit = useCallback((row: HireContractTableRow) => {
    const label = [row.vehicle_vrm, row.driver_label].filter(Boolean).join(" · ") || "Hire contract";
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

  const closeAudit = useCallback(() => {
    if (auditLoading) return;
    setAuditOpen(false);
    setAuditEvents([]);
    setAuditError(null);
  }, [auditLoading]);

  const openCancelConfirm = useCallback((row: HireContractTableRow) => {
    setCancelTarget(row);
    setCancelConfirmOpen(true);
  }, []);

  const closeCancelConfirm = useCallback(() => {
    if (actionPending) return;
    setCancelConfirmOpen(false);
    setCancelTarget(null);
  }, [actionPending]);

  const openRegenerateConfirm = useCallback((row: HireContractTableRow) => {
    setRegenerateTarget(row);
    setRegenerateConfirmOpen(true);
  }, []);

  const closeRegenerateConfirm = useCallback(() => {
    if (actionPending) return;
    setRegenerateConfirmOpen(false);
    setRegenerateTarget(null);
  }, [actionPending]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = [
        r.vehicle_vrm,
        r.vehicle_label,
        r.driver_label,
        r.status,
        statusLabel(r),
        r.driver_access_status,
        r.driver_access_label,
        r.esign_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search]);

  function prepareForSignature(row: HireContractTableRow) {
    setActionError(null);
    setOverlay({
      phase: "pending",
      title: "Preparing documents for e-signature…",
      detail:
        row.agreement_count > 1
          ? `Creating PDFs for ${row.agreement_count} agreements and opening the designer. This may take a moment.`
          : "Creating the contract PDF and opening the e-sign designer. This may take a moment.",
    });
    startAction(async () => {
      const res = await ensureHireGroupEnvelopesPreparedAction(row.id);
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Could not prepare documents", detail: res.error });
        setActionError(res.error);
        return;
      }
      onRefresh();
      window.location.href = `/rental/esign/${res.firstEnvelopeId}`;
    });
  }

  function runAction(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    pending: { title: string; detail: string },
    success: { title: string; detail: string },
  ) {
    setActionError(null);
    setOverlay({ phase: "pending", title: pending.title, detail: pending.detail });
    startAction(async () => {
      const res = await fn();
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Action failed", detail: res.error ?? "Something went wrong." });
        setActionError(res.error ?? "Action failed.");
        return;
      }
      setOverlay({ phase: "success", title: success.title, detail: success.detail });
      onRefresh();
    });
  }

  function sendForSignature(row: HireContractTableRow) {
    runAction(
      () => sendHireGroupSigningBundleAction(row.id, { resend: Boolean(row.signing_bundle_sent_at) }),
      {
        title: row.signing_bundle_sent_at ? "Resending for signature…" : "Sending for signature…",
        detail: "Emailing the signing bundle to the hirer.",
      },
      {
        title: row.signing_bundle_sent_at ? "Signing email resent" : "Sent for signature",
        detail: "The hirer will receive an email with signing links.",
      },
    );
  }

  const actionHandlers = {
    openAudit,
    onOpenDraft,
    prepareForSignature,
    onSendForSignature: sendForSignature,
    openRegenerateConfirm,
    openCancelConfirm,
  };

  const tableBusy = busy || actionPending || overlay?.phase === "pending";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            className="rph-input w-full max-w-md"
            placeholder="Search contracts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rph-btn-ghost" disabled={tableBusy} onClick={onRefresh}>
            Refresh
          </button>
          {canWrite ? (
            <button type="button" className="rph-btn-primary" disabled={tableBusy} onClick={onNewContract}>
              New contract
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="rph-alert-error text-sm">{actionError}</p> : null}

      <div className="space-y-3 lg:hidden">
        {!filtered.length ? (
          <p className="rph-muted py-8 text-center text-sm">No contracts found.</p>
        ) : (
          filtered.map((r) => (
            <HireContractMobileCard
              key={r.id}
              row={r}
              vehicleScoped={vehicleScoped}
              actions={rowActionsProps(r, canWrite, tableBusy, actionHandlers)}
            />
          ))
        )}
      </div>

      <div className="hidden space-y-1 lg:block">
        <div className="-mx-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <div className="min-w-[52rem] rounded-xl border border-rph-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rph-border bg-rph-chrome/60 text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                  {!vehicleScoped ? <th className="px-4 py-2.5">Vehicle</th> : null}
                  <th className="px-4 py-2.5">Driver</th>
                  <th className="px-4 py-2.5">Started</th>
                  <th className="px-4 py-2.5">Ended</th>
                  <th className="px-4 py-2.5">Rent</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Driver access</th>
                  <th className="px-4 py-2.5">E-sign</th>
                  <th className="px-4 py-2.5">Workflow</th>
                  <th className="w-24 min-w-24 p-0" aria-hidden />
                  <th className="sticky right-0 z-20 min-w-[6.5rem] bg-rph-chrome/95 px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {!filtered.length ? (
                  <tr>
                    <td colSpan={vehicleScoped ? 10 : 11} className="px-4 py-8 text-center text-rph-fg-muted">
                      No contracts found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="group bg-rph-raised/30 hover:bg-rph-chrome/40">
                        {!vehicleScoped ? (
                          <td className="px-4 py-3">
                            {r.status !== "draft" ? (
                              <Link
                                href={`/rental/hires/${r.id}`}
                                className="font-medium text-rph-link hover:text-rph-link-hover"
                              >
                                {r.vehicle_vrm ?? "—"}
                              </Link>
                            ) : (
                              <span className="font-medium text-rph-fg">{r.vehicle_vrm ?? "—"}</span>
                            )}
                            {r.vehicle_label ? (
                              <p className="text-xs text-rph-fg-muted">{r.vehicle_label}</p>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-rph-fg-secondary">{r.driver_label ?? "—"}</td>
                        <td className="px-4 py-3 text-rph-fg-secondary">{startLabel(r)}</td>
                        <td className="px-4 py-3 text-rph-fg-secondary">{endLabel(r)}</td>
                        <td className="px-4 py-3 text-rph-fg-secondary">
                          {r.rent_amount_gbp > 0 ? `£${r.rent_amount_gbp.toFixed(2)} / ${r.rent_cadence}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rph-pill capitalize">{statusLabel(r)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <WorkflowStatusPill label={r.driver_access_label} tone={r.driver_access_tone} />
                        </td>
                        <td className="px-4 py-3">
                          <WorkflowStatusPill label={r.esign_label} tone={r.esign_tone} />
                        </td>
                        <td className="px-4 py-3">
                          {r.lifecycle_label ? (
                            <WorkflowStatusPill label={r.lifecycle_label} tone={r.lifecycle_tone} />
                          ) : (
                            <span className="text-rph-fg-muted">—</span>
                          )}
                        </td>
                        <td className="w-24 min-w-24 p-0" aria-hidden />
                        <td className="sticky right-0 z-20 min-w-[6.5rem] bg-rph-raised/95 px-4 py-3 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.25)] backdrop-blur-sm group-hover:bg-rph-chrome/40">
                          <HireContractRowActionsMenu
                            {...rowActionsProps(r, canWrite, tableBusy, actionHandlers)}
                          />
                        </td>
                      </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <HireGroupAuditModal
        open={auditOpen}
        title={auditTitle}
        loading={auditLoading}
        error={auditError}
        events={auditEvents}
        onClose={closeAudit}
      />

      <ConfirmDialog
        open={regenerateConfirmOpen}
        title="Discard layout and regenerate contracts?"
        description={hireRegenerateContractsConfirmCopy(Boolean(regenerateTarget?.signing_bundle_sent_at))}
        confirmLabel="Regenerate contracts"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onCancel={closeRegenerateConfirm}
        onConfirm={() => {
          if (!regenerateTarget) return;
          const id = regenerateTarget.id;
          setRegenerateConfirmOpen(false);
          setRegenerateTarget(null);
          runAction(
            () => regenerateHireGroupContractsAction(id),
            {
              title: "Regenerating contracts…",
              detail: "Discarding saved layout and rebuilding PDFs. This may take a moment.",
            },
            {
              title: "Contracts regenerated",
              detail: "Open Prepare documents for signature to configure fields again.",
            },
          );
        }}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel hire contract?"
        description={hireCancelConfirmCopy(cancelTarget?.vehicle_vrm)}
        confirmLabel="Cancel contract"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onCancel={closeCancelConfirm}
        onConfirm={() => {
          if (!cancelTarget) return;
          const id = cancelTarget.id;
          setCancelConfirmOpen(false);
          setCancelTarget(null);
          runAction(
            () => cancelHireGroupAction(id),
            { title: "Cancelling contract…", detail: "Voiding envelopes and releasing the vehicle." },
            { title: "Contract cancelled", detail: "The hire contract has been cancelled." },
          );
        }}
      />
    </div>
  );
}
