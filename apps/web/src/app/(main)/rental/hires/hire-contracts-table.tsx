"use client";

import { formatUkDate } from "@/lib/datetime/uk";
import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { cancelHireGroupAction, ensureHireGroupEnvelopesPreparedAction, loadHireGroupAuditTrailAction, regenerateHireGroupContractsAction } from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { hireTableStatusToneClass, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { hireCancelConfirmCopy, hireRegenerateContractsConfirmCopy, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
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

function WorkflowStatusPill({ label, tone }: { label: string; tone: HireTableStatusTone }) {
  if (label === "—") return <span className="text-rph-fg-muted">—</span>;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}>
      {label}
    </span>
  );
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

      <div className="overflow-hidden rounded-xl border border-rph-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rph-border bg-rph-chrome/60 text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
              {!vehicleScoped ? <th className="px-4 py-2.5">Vehicle</th> : null}
              <th className="px-4 py-2.5">Driver</th>
              <th className="px-4 py-2.5">Start</th>
              <th className="px-4 py-2.5">Rent</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Driver access</th>
              <th className="px-4 py-2.5">E-sign</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rph-border">
            {!filtered.length ? (
              <tr>
                <td colSpan={vehicleScoped ? 7 : 8} className="px-4 py-8 text-center text-rph-fg-muted">
                  No contracts found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="bg-rph-raised/30 hover:bg-rph-chrome/40">
                  {!vehicleScoped ? (
                    <td className="px-4 py-3">
                      <span className="font-medium text-rph-fg">{r.vehicle_vrm ?? "—"}</span>
                      {r.vehicle_label ? (
                        <p className="text-xs text-rph-fg-muted">{r.vehicle_label}</p>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-rph-fg-secondary">{r.driver_label ?? "—"}</td>
                  <td className="px-4 py-3 text-rph-fg-secondary">
                    {r.start_date ? formatUkDate(r.start_date) : "—"}
                  </td>
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
                  <td className="px-4 py-3 text-right">
                    <HireContractRowActionsMenu
                      row={r}
                      canWrite={canWrite}
                      disabled={tableBusy}
                      onAudit={() => openAudit(r)}
                      onContinue={() => onOpenDraft(r.id)}
                      onPrepareForSignature={() => prepareForSignature(r)}
                      onSendForSignature={() =>
                        runAction(
                          () =>
                            sendHireGroupSigningBundleAction(r.id, { resend: Boolean(r.signing_bundle_sent_at) }),
                          {
                            title: r.signing_bundle_sent_at ? "Resending for signature…" : "Sending for signature…",
                            detail: "Emailing the signing bundle to the hirer.",
                          },
                          {
                            title: r.signing_bundle_sent_at ? "Signing email resent" : "Sent for signature",
                            detail: "The hirer will receive an email with signing links.",
                          },
                        )
                      }
                      onRegenerateContracts={() => openRegenerateConfirm(r)}
                      onCancel={() => openCancelConfirm(r)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
