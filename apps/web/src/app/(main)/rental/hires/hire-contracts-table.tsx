"use client";

import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { cancelHireGroupAction, ensureHireGroupEnvelopesPreparedAction, loadHireGroupAuditTrailAction, regenerateHireGroupContractsAction } from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { RphSelect, rphSelectRowsTriggerClass } from "@/components/forms/rph-select";
import { RphFilterToolbar } from "@/components/ui/rph-toolbar";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { hireTableStatusToneClass, hireGroupTableStatus, hireContractTableStartLabel, hireContractTableEndLabel, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { hireCancelConfirmCopy, hireRegenerateContractsConfirmCopy, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  HIRE_CONTRACT_PAGE_SIZES,
  HIRE_CONTRACT_STATUS_FILTER_OPTIONS,
  hireContractMatchesStatusFilter,
  type HireContractStatusFilter,
} from "@/lib/fleet/hire-contract-table-filters";
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
  /** When set, hide rental company column (e.g. subcompany workspace hires tab). */
  hideSubcompanyColumn?: boolean;
};

function hireStatusDisplay(row: HireContractTableRow) {
  return hireGroupTableStatus(row.status, { wizardStep: row.wizard_step });
}

function startLabel(row: HireContractTableRow): string {
  return hireContractTableStartLabel(row);
}

function endLabel(row: HireContractTableRow): string {
  return hireContractTableEndLabel(row);
}

function WorkflowStatusPill({ label, tone }: { label: string; tone: HireTableStatusTone }) {
  if (label === "—") return <span className="text-rph-fg-muted">—</span>;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}>
      {label}
    </span>
  );
}

function HireStatusCell({ row }: { row: HireContractTableRow }) {
  return (
    <div className="space-y-1">
      <WorkflowStatusPill {...hireStatusDisplay(row)} />
      {row.lifecycle_label ? (
        <p className="text-xs text-rph-fg-muted">{row.lifecycle_label}</p>
      ) : null}
    </div>
  );
}

function DriverCell({ row }: { row: HireContractTableRow }) {
  const contact = row.driver_email ?? row.driver_licence_number;
  if (!row.driver_name && !contact) return <span className="text-rph-fg-muted">—</span>;
  return (
    <div>
      {row.driver_name ? <p className="font-medium text-rph-fg">{row.driver_name}</p> : null}
      {contact ? (
        <p className={`text-rph-fg-secondary ${row.driver_name ? "text-xs" : "text-sm"}`}>{contact}</p>
      ) : null}
    </div>
  );
}

function driverSearchHaystack(row: HireContractTableRow): string {
  return [
    row.driver_name,
    row.driver_email,
    row.driver_licence_number,
    row.subcompany_name,
    row.vehicle_vrm,
    row.vehicle_label,
    row.status,
    hireStatusDisplay(row).label,
    row.driver_access_label,
    row.esign_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function HireContractPaginationBar({
  pageIndex,
  pageCount,
  pageSize,
  total,
  fromRow,
  toRow,
  disabled,
  onPrevious,
  onNext,
  onPageSizeChange,
  className = "",
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  fromRow: number;
  toRow: number;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div
      className={`flex shrink-0 items-center justify-between gap-3 border-t border-rph-border bg-rph-raised/95 px-4 py-2.5 backdrop-blur-sm ${className}`.trim()}
    >
      <p className="rph-muted shrink-0 text-xs">
        Showing {fromRow.toLocaleString("en-GB")}–{toRow.toLocaleString("en-GB")} of{" "}
        {total.toLocaleString("en-GB")}
      </p>
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
        <button
          type="button"
          className="rph-btn-ghost h-9 shrink-0 px-3 text-sm"
          disabled={disabled || pageIndex <= 0}
          onClick={onPrevious}
        >
          Previous
        </button>
        <span className="rph-muted shrink-0 whitespace-nowrap text-xs">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="rph-btn-ghost h-9 shrink-0 px-3 text-sm"
          disabled={disabled || pageIndex >= pageCount - 1}
          onClick={onNext}
        >
          Next
        </button>
        <span className="rph-muted shrink-0 whitespace-nowrap text-xs">Rows</span>
        <RphSelect
          value={String(pageSize)}
          disabled={disabled}
          aria-label="Rows per page"
          triggerClassName={rphSelectRowsTriggerClass}
          options={HIRE_CONTRACT_PAGE_SIZES.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        />
      </div>
    </div>
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
  hideSubcompanyColumn,
  actions,
}: {
  row: HireContractTableRow;
  vehicleScoped?: boolean;
  hideSubcompanyColumn?: boolean;
  actions: RowActionsProps;
}) {
  const title = vehicleScoped ? row.driver_name ?? row.driver_email ?? "Hire contract" : row.vehicle_vrm ?? "—";
  const subtitle = vehicleScoped
    ? row.driver_email ?? row.driver_licence_number
    : [row.vehicle_label, row.driver_name ?? row.driver_email].filter(Boolean).join(" · ") || null;

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
            <HireStatusCell row={row} />
          </div>
        </div>
        <HireContractRowActionsMenu {...actions} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {!hideSubcompanyColumn && row.subcompany_name ? (
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Rental company</dt>
            <dd className="mt-0.5 text-rph-fg-secondary">{row.subcompany_name}</dd>
          </div>
        ) : null}
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
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Next step</dt>
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
  hideSubcompanyColumn,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HireContractStatusFilter>("all");
  const [subcompanyFilter, setSubcompanyFilter] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
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

  const subcompanyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.subcompany_id && row.subcompany_name) {
        map.set(row.subcompany_id, row.subcompany_name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "en-GB"));
  }, [rows]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, statusFilter, subcompanyFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!hireContractMatchesStatusFilter(row.status, statusFilter)) return false;
      if (
        !hideSubcompanyColumn &&
        subcompanyFilter !== "all" &&
        row.subcompany_id !== subcompanyFilter
      ) {
        return false;
      }
      if (term && !driverSearchHaystack(row).includes(term)) return false;
      return true;
    });
  }, [rows, search, statusFilter, subcompanyFilter, hideSubcompanyColumn]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const paginated = useMemo(
    () => filtered.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize),
    [filtered, safePageIndex, pageSize],
  );
  const fromRow = total === 0 ? 0 : safePageIndex * pageSize + 1;
  const toRow = Math.min((safePageIndex + 1) * pageSize, total);
  const hasFilters =
    search.trim().length > 0 || statusFilter !== "all" || subcompanyFilter !== "all";

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
  const tableColumnCount =
    (vehicleScoped ? 0 : 1) + (hideSubcompanyColumn ? 0 : 1) + 7 + 1;

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setSubcompanyFilter("all");
    setPageIndex(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <RphFilterToolbar
          actions={
            <>
              <button type="button" className="rph-btn-ghost" disabled={tableBusy} onClick={onRefresh}>
                Refresh
              </button>
              {canWrite ? (
                <button type="button" className="rph-btn-primary" disabled={tableBusy} onClick={onNewContract}>
                  New contract
                </button>
              ) : null}
            </>
          }
        >
          <input
            className="rph-input w-full min-w-[12rem] max-w-md"
            placeholder="Search vehicle, driver, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="w-full min-w-[10rem] sm:max-w-[12rem]">
            <RphSelect
              value={statusFilter}
              aria-label="Filter by status"
              options={HIRE_CONTRACT_STATUS_FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onValueChange={(value) => setStatusFilter(value as HireContractStatusFilter)}
            />
          </div>
          {!hideSubcompanyColumn && subcompanyOptions.length > 1 ? (
            <div className="w-full min-w-[10rem] sm:max-w-[14rem]">
              <RphSelect
                value={subcompanyFilter}
                aria-label="Filter by rental company"
                options={[
                  { value: "all", label: "All rental companies" },
                  ...subcompanyOptions.map(([id, name]) => ({ value: id, label: name })),
                ]}
                onValueChange={setSubcompanyFilter}
              />
            </div>
          ) : null}
          {hasFilters ? (
            <button type="button" className="rph-btn-ghost h-10 px-3 text-sm" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </RphFilterToolbar>
        {total > 0 ? (
          <p className="rph-muted text-xs">
            {hasFilters ? `${total.toLocaleString("en-GB")} matching contracts` : `${total.toLocaleString("en-GB")} contracts`}
          </p>
        ) : null}
      </div>

      {actionError ? <p className="rph-alert-error text-sm">{actionError}</p> : null}

      <div className="lg:hidden">
        <div className="space-y-3 pb-3">
          {!paginated.length ? (
            <p className="rph-muted py-8 text-center text-sm">
              {hasFilters ? "No contracts match your filters." : "No contracts found."}
            </p>
          ) : (
            paginated.map((r) => (
              <HireContractMobileCard
                key={r.id}
                row={r}
                vehicleScoped={vehicleScoped}
                hideSubcompanyColumn={hideSubcompanyColumn}
                actions={rowActionsProps(r, canWrite, tableBusy, actionHandlers)}
              />
            ))
          )}
        </div>
        <HireContractPaginationBar
          className="sticky bottom-0 z-20 -mx-4 border-rph-border sm:mx-0 sm:rounded-b-xl"
          {...{
            pageIndex: safePageIndex,
            pageCount,
            pageSize,
            total,
            fromRow,
            toRow,
            disabled: tableBusy,
            onPrevious: () => setPageIndex((p) => Math.max(0, p - 1)),
            onNext: () => setPageIndex((p) => Math.min(pageCount - 1, p + 1)),
            onPageSizeChange: (size: number) => {
              setPageSize(size);
              setPageIndex(0);
            },
          }}
        />
      </div>

      <div className="hidden lg:flex lg:max-h-[min(70vh,42rem)] lg:flex-col lg:overflow-hidden lg:rounded-xl lg:border lg:border-rph-border">
          <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="sticky top-0 z-10 border-b border-rph-border bg-rph-chrome/95 text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted backdrop-blur-sm">
                <tr>
                  {!vehicleScoped ? <th className="px-4 py-2.5">Vehicle</th> : null}
                  {!hideSubcompanyColumn ? <th className="px-4 py-2.5">Rental company</th> : null}
                  <th className="px-4 py-2.5">Driver</th>
                  <th className="px-4 py-2.5">Started</th>
                  <th className="px-4 py-2.5">Ended</th>
                  <th className="px-4 py-2.5">Rent</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Driver access</th>
                  <th className="px-4 py-2.5">E-sign</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {!paginated.length ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-8 text-center text-rph-fg-muted">
                      {hasFilters ? "No contracts match your filters." : "No contracts found."}
                    </td>
                  </tr>
                ) : (
                  paginated.map((r) => (
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
                        {!hideSubcompanyColumn ? (
                          <td className="px-4 py-3 text-rph-fg-secondary">{r.subcompany_name ?? "—"}</td>
                        ) : null}
                        <td className="px-4 py-3">
                          <DriverCell row={r} />
                        </td>
                        <td className="px-4 py-3 text-rph-fg-secondary">{startLabel(r)}</td>
                        <td className="px-4 py-3 text-rph-fg-secondary">{endLabel(r)}</td>
                        <td className="px-4 py-3 text-rph-fg-secondary">
                          {r.rent_amount_gbp > 0 ? `£${r.rent_amount_gbp.toFixed(2)} / ${r.rent_cadence}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <HireStatusCell row={r} />
                        </td>
                        <td className="px-4 py-3">
                          <WorkflowStatusPill label={r.driver_access_label} tone={r.driver_access_tone} />
                        </td>
                        <td className="px-4 py-3">
                          <WorkflowStatusPill label={r.esign_label} tone={r.esign_tone} />
                        </td>
                        <td className="px-4 py-3 text-right">
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
          <HireContractPaginationBar
            {...{
              pageIndex: safePageIndex,
              pageCount,
              pageSize,
              total,
              fromRow,
              toRow,
              disabled: tableBusy,
              onPrevious: () => setPageIndex((p) => Math.max(0, p - 1)),
              onNext: () => setPageIndex((p) => Math.min(pageCount - 1, p + 1)),
              onPageSizeChange: (size: number) => {
                setPageSize(size);
                setPageIndex(0);
              },
            }}
          />
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
