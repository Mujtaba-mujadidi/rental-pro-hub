"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import {
  listHireContractsAction,
  type HireContractTableRow,
} from "@/app/actions/rental-hire-wizard";
import {
  loadVehicleHiresPageAction,
  type VehicleHiresPageData,
} from "@/app/actions/rental-vehicle-hires";
import {
  cancelHireGroupAction,
  ensureHireGroupEnvelopesPreparedAction,
  loadHireGroupAuditTrailAction,
  regenerateHireGroupContractsAction,
} from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { HireContractWizardModal } from "@/app/(main)/rental/hires/hire-contract-wizard-modal";
import { HireContractRowActionsMenu } from "@/app/(main)/rental/hires/hire-contract-row-actions-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  driverAccessTableStatus,
  hireGroupTableStatus,
  hireTableStatusToneClass,
} from "@/lib/fleet/hire-contract-table-display";
import { hireCancelConfirmCopy, hireRegenerateContractsConfirmCopy, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import { formatUkDateText, ukTodayYmd } from "@/lib/datetime/uk";
import { responsiveTableCellProps } from "@/lib/ui/responsive-table";
import {
  hireDurationDays,
  settlementTablePill,
} from "@/lib/fleet/vehicle-hires-page";

type Props = {
  vehicleId: string;
  readOnlyHistoric?: boolean;
  historicSubcompanyName?: string | null;
  onHireListChanged?: () => void;
};

function rentCadenceLabel(cadence: string): string {
  if (cadence === "daily") return "per day";
  if (cadence === "weekly") return "per week";
  if (cadence === "monthly") return "per month";
  return cadence;
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "info" | "success" | "warn";
}) {
  const dot =
    tone === "info"
      ? "bg-sky-500"
      : tone === "success"
        ? "bg-emerald-500"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-rph-fg-muted/50";
  return (
    <div className="rph-card relative px-4 py-3.5">
      <span className={`absolute right-3.5 top-3.5 h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <p className="text-xs font-medium text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-rph-fg-muted">{hint}</p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "pending" | "success" | "warning" | "error" }) {
  if (!label || label === "—") return null;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}>
      {label}
    </span>
  );
}

function hirePeriodLabel(row: HireContractTableRow): string {
  const start = row.activated_at?.slice(0, 10) ?? row.start_date;
  if (!start) return "—";
  const end =
    row.terminated_at?.slice(0, 10) ??
    row.ended_at?.slice(0, 10) ??
    (row.status === "active" ? null : row.scheduled_end_date);
  if (!end) {
    return row.status === "active"
      ? `${formatUkDateText(start)} — Ongoing`
      : formatUkDateText(start);
  }
  return `${formatUkDateText(start)} — ${formatUkDateText(end)}`;
}

function driverDisplay(row: HireContractTableRow): string {
  return row.driver_name ?? row.driver_email ?? row.driver_licence_number ?? "—";
}

export function VehicleHiresView({
  vehicleId,
  readOnlyHistoric = false,
  historicSubcompanyName = null,
  onHireListChanged,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [rows, setRows] = useState<HireContractTableRow[]>([]);
  const [pageData, setPageData] = useState<VehicleHiresPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);

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
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(
    (opts?: { syncWorkspace?: boolean }) => {
      startTransition(async () => {
        const [listRes, pageRes] = await Promise.all([
          listHireContractsAction("", vehicleId),
          loadVehicleHiresPageAction(vehicleId),
        ]);
        if (!listRes.ok) {
          setError(listRes.error);
          return;
        }
        if (!pageRes.ok) {
          setError(pageRes.error);
          return;
        }
        setRows(listRes.rows);
        setPageData(pageRes.data);
        setError(null);
        if (opts?.syncWorkspace) onHireListChanged?.();
      });
    },
    [vehicleId, onHireListChanged],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useHireContractsRealtime(() => reload({ syncWorkspace: true }), { vehicleId });

  const canWrite = Boolean(pageData?.canWrite) && !readOnlyHistoric;
  const currentHireId = pageData?.currentHire?.hireGroupId ?? null;
  const historyRows = useMemo(
    () => rows.filter((row) => row.id !== currentHireId),
    [rows, currentHireId],
  );
  const todayYmd = ukTodayYmd();
  const tableBusy = pending || actionPending || overlay?.phase === "pending";

  const openAudit = useCallback((row: HireContractTableRow) => {
    const label = [row.vehicle_vrm, row.driver_name ?? row.driver_email].filter(Boolean).join(" · ") || "Hire contract";
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
      reload({ syncWorkspace: true });
      window.location.href = `/rental/esign/${res.firstEnvelopeId}`;
    });
  }

  function runAction(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    pendingCopy: { title: string; detail: string },
    success: { title: string; detail: string },
  ) {
    setActionError(null);
    setOverlay({ phase: "pending", title: pendingCopy.title, detail: pendingCopy.detail });
    startAction(async () => {
      const res = await fn();
      if (!res.ok) {
        setOverlay({ phase: "error", title: "Action failed", detail: res.error ?? "Something went wrong." });
        setActionError(res.error ?? "Action failed.");
        return;
      }
      setOverlay({ phase: "success", title: success.title, detail: success.detail });
      reload({ syncWorkspace: true });
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

  const current = pageData?.currentHire ?? null;
  const stats = pageData?.stats;
  const currentStatus = current ? hireGroupTableStatus(current.status) : null;
  const accessStatus = current ? driverAccessTableStatus(current.driverAccessStatus) : null;
  const agreementTone =
    current?.agreementLabel === "Fully signed"
      ? "success"
      : current?.agreementLabel === "Awaiting signature"
        ? "pending"
        : "neutral";

  const currentPeriod =
    current == null
      ? null
      : current.endDate
        ? `${formatUkDateText(current.startDate)} — ${formatUkDateText(current.endDate)}`
        : `${formatUkDateText(current.startDate)} — Ongoing`;

  const rentHintParts: string[] = [];
  if (current) {
    if (current.rentAmountGbp > 0) {
      rentHintParts.push(`${formatGbp(current.rentAmountGbp)} ${rentCadenceLabel(current.rentCadence)}`);
    }
    if (current.depositGbp != null && current.depositGbp > 0) {
      rentHintParts.push(`${formatGbp(current.depositGbp)} deposit`);
    }
    if (current.driverAccessStatus === "approved") {
      rentHintParts.push("Driver access enabled");
    } else if (accessStatus) {
      rentHintParts.push(accessStatus.label);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {readOnlyHistoric ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">Historic hires only</p>
          <p className="mt-1">
            Showing ended hire contracts from when this vehicle operated under{" "}
            {historicSubcompanyName ?? "your company"}. New rentals under the current operator are not shown.
          </p>
        </div>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {actionError ? <p className="rph-alert-error text-sm">{actionError}</p> : null}

      {current ? (
        <section className="overflow-hidden rounded-xl bg-rph-rail px-4 py-4 text-white sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Current hire</p>
              <div className="flex flex-wrap gap-1.5">
                {currentStatus ? <StatusPill label={currentStatus.label} tone={currentStatus.tone} /> : null}
                <StatusPill label={current.agreementLabel} tone={agreementTone} />
              </div>
              <p className="text-lg font-semibold tracking-tight sm:text-xl">
                {current.driverLabel}
                {currentPeriod ? ` · ${currentPeriod}` : null}
              </p>
              {rentHintParts.length ? (
                <p className="text-sm text-white/80">{rentHintParts.join(" · ")}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 lg:shrink-0">
              {current.canViewSignedDocuments ? (
                <Link
                  href={`/rental/hires/${current.hireGroupId}/details`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-white/40 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  View agreement
                </Link>
              ) : null}
              <Link
                href={`/rental/hires/${current.hireGroupId}`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white hover:bg-sky-400"
              >
                Open hire workspace
              </Link>
            </div>
          </div>
        </section>
      ) : !pending && pageData ? (
        <section className="rph-card px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-fg-muted">Current hire</p>
          <p className="mt-1 text-sm text-rph-fg-secondary">No open hire on this vehicle.</p>
          {canWrite ? (
            <button
              type="button"
              className="rph-btn-primary mt-3"
              disabled={tableBusy}
              onClick={() => {
                setEditDraftId(null);
                setWizardOpen(true);
              }}
            >
              New hire
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total hires"
          value={stats ? String(stats.totalHires) : pending ? "…" : "—"}
          hint="Non-draft contracts"
          tone="info"
        />
        <MetricCard
          label="Hire days"
          value={stats ? String(stats.hireDays) : pending ? "…" : "—"}
          hint={
            stats?.utilisationPercent != null
              ? `${stats.utilisationPercent}% of days since vehicle added`
              : "From start through end (or today if open)"
          }
          tone="info"
        />
        <MetricCard
          label="Hire income"
          value={
            stats?.hireIncomeGbp != null
              ? formatGbp(stats.hireIncomeGbp)
              : pending
                ? "…"
                : "—"
          }
          hint={stats?.hireIncomeGbp != null ? "Net hire income (same as Financials)" : "Not available"}
          tone="success"
        />
        <MetricCard
          label="Outstanding"
          value={stats ? formatGbp(stats.outstandingGbp) : pending ? "…" : "—"}
          hint={
            stats && stats.outstandingGbp > 0
              ? "Accrued rent due + open settlements"
              : "No balance due"
          }
          tone={stats && stats.outstandingGbp > 0 ? "warn" : "success"}
        />
      </div>

      <section className="rph-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rph-border px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-fg-muted">History</p>
            <h2 className="mt-0.5 text-base font-semibold text-rph-fg">Previous hires</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rph-btn-ghost" disabled={tableBusy} onClick={() => reload({ syncWorkspace: true })}>
              Refresh
            </button>
            {canWrite ? (
              <button
                type="button"
                className="rph-btn-primary"
                disabled={tableBusy}
                onClick={() => {
                  setEditDraftId(null);
                  setWizardOpen(true);
                }}
              >
                New hire
              </button>
            ) : null}
          </div>
        </div>

        {historyRows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-rph-fg-muted sm:px-5">
            {pending ? "Loading hire history…" : "No previous hires yet."}
          </p>
        ) : (
          <div className="rph-table-responsive">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-rph-border bg-rph-chrome/40 text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                <tr>
                  <th className="px-4 py-3 sm:px-5">Driver</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Rent</th>
                  <th className="px-4 py-3">Settlement</th>
                  <th className="px-4 py-3 sm:px-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => {
                  const settlement = pageData?.settlementsByGroupId[row.id];
                  const pill = settlementTablePill(settlement?.direction, settlement?.amountGbp);
                  const days = hireDurationDays(
                    {
                      status: row.status,
                      start_date: row.start_date,
                      activated_at: row.activated_at,
                      ended_at: row.ended_at,
                      terminated_at: row.terminated_at,
                    },
                    todayYmd,
                  );
                  return (
                    <tr key={row.id} className="border-b border-rph-border last:border-0">
                      <td
                        {...responsiveTableCellProps(
                          { header: "Driver", meta: { tablePrimary: true } },
                          "px-4 py-3.5 sm:px-5",
                        )}
                      >
                        {row.status !== "draft" ? (
                          <Link href={`/rental/hires/${row.id}`} className="font-medium text-rph-link hover:text-rph-link-hover">
                            {driverDisplay(row)}
                          </Link>
                        ) : (
                          <span className="font-medium text-rph-fg">{driverDisplay(row)}</span>
                        )}
                      </td>
                      <td {...responsiveTableCellProps({ header: "Period" }, "px-4 py-3.5 text-rph-fg-secondary")}>
                        {hirePeriodLabel(row)}
                      </td>
                      <td
                        {...responsiveTableCellProps(
                          { header: "Duration" },
                          "px-4 py-3.5 tabular-nums text-rph-fg-secondary",
                        )}
                      >
                        {days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "—"}
                      </td>
                      <td {...responsiveTableCellProps({ header: "Rent" }, "px-4 py-3.5 text-rph-fg-secondary")}>
                        {row.rent_amount_gbp > 0
                          ? `${formatGbp(row.rent_amount_gbp)} / ${row.rent_cadence}`
                          : "—"}
                      </td>
                      <td {...responsiveTableCellProps({ header: "Settlement" }, "px-4 py-3.5")}>
                        <StatusPill label={pill.label} tone={pill.tone} />
                      </td>
                      <td
                        {...responsiveTableCellProps(
                          { header: "Actions", meta: { tableActions: true, dataLabel: "" } },
                          "px-4 py-3.5 sm:px-5",
                        )}
                      >
                        <HireContractRowActionsMenu
                          row={row}
                          canWrite={canWrite}
                          disabled={tableBusy}
                          onAudit={() => openAudit(row)}
                          onContinue={() => {
                            setEditDraftId(row.id);
                            setWizardOpen(true);
                          }}
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
        initialVehicleId={vehicleId}
        onClose={() => {
          setWizardOpen(false);
          setEditDraftId(null);
          reload({ syncWorkspace: true });
        }}
        onSaved={() => reload({ syncWorkspace: true })}
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
          setAuditEvents([]);
          setAuditError(null);
        }}
      />

      <ConfirmDialog
        open={regenerateConfirmOpen}
        title="Discard layout and regenerate contracts?"
        description={hireRegenerateContractsConfirmCopy(Boolean(regenerateTarget?.signing_bundle_sent_at))}
        confirmLabel="Regenerate contracts"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onCancel={() => {
          if (actionPending) return;
          setRegenerateConfirmOpen(false);
          setRegenerateTarget(null);
        }}
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

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel hire contract?"
        description={hireCancelConfirmCopy(cancelTarget?.vehicle_vrm)}
        confirmLabel="Cancel contract"
        cancelLabel="Go back"
        variant="danger"
        pending={actionPending}
        onCancel={() => {
          if (actionPending) return;
          setCancelConfirmOpen(false);
          setCancelTarget(null);
        }}
        onConfirm={() => {
          if (!cancelTarget) return;
          const id = cancelTarget.id;
          setCancelConfirmOpen(false);
          setCancelTarget(null);
          runAction(
            () => cancelHireGroupAction(id),
            { title: "Cancelling contract…", detail: "Updating hire status." },
            { title: "Contract cancelled", detail: "The hire contract was cancelled." },
          );
        }}
      />

      <ActionStatusOverlay state={overlay} onDismiss={() => setOverlay(null)} />
    </div>
  );
}
