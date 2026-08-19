"use client";

import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { cancelHireGroupAction, ensureHireGroupEnvelopesPreparedAction, loadHireGroupAuditTrailAction, regenerateHireGroupContractsAction } from "@/app/actions/rental-hires";
import { sendHireGroupSigningBundleAction } from "@/app/actions/rental-hire-signing";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { RphSelect, rphSelectTriggerClass } from "@/components/forms/rph-select";
import { RphFilterToolbar } from "@/components/ui/rph-toolbar";
import { RphTablePaginationBar } from "@/components/ui/rph-table-pagination-bar";
import { HireGroupAuditModal } from "@/components/fleet/hire-group-audit-modal";
import { hireTableStatusToneClass, hireGroupTableStatus, hireContractTableStartLabel, hireContractTableEndLabel, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { hireCancelConfirmCopy, hireRegenerateContractsConfirmCopy, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  HIRE_CONTRACT_STATUS_FILTER_OPTIONS,
  hireContractMatchesStatusFilter,
  type HireContractStatusFilter,
} from "@/lib/fleet/hire-contract-table-filters";
import {
  HIRE_LIST_TAB_OPTIONS,
  hireListMatchesTab,
  hireListPeriodLabel,
  hireListProgress,
  hireListRentLabel,
  type HireListTab,
} from "@/lib/fleet/hire-list-tabs";
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
  /** Fleet page layout: lifecycle tabs + Progress column (screenshot). */
  variant?: "fleet" | "table";
  listTab?: HireListTab;
  onListTabChange?: (tab: HireListTab) => void;
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

function HireListSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full min-w-[12rem] sm:w-[16rem]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rph-fg-muted" aria-hidden>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="h-9 w-full rounded-lg border border-rph-border bg-rph-chrome py-2 pl-9 pr-3 text-sm text-rph-fg placeholder:text-rph-fg-muted outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20"
        placeholder="Search driver or vehicle"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search driver or vehicle"
      />
    </div>
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
  fleetLayout,
  actions,
}: {
  row: HireContractTableRow;
  vehicleScoped?: boolean;
  hideSubcompanyColumn?: boolean;
  fleetLayout?: boolean;
  actions: RowActionsProps;
}) {
  const title = vehicleScoped ? row.driver_name ?? row.driver_email ?? "Hire contract" : row.vehicle_vrm ?? "—";
  const subtitle = vehicleScoped
    ? row.driver_email ?? row.driver_licence_number
    : [row.vehicle_label, !hideSubcompanyColumn ? row.subcompany_name : null]
        .filter(Boolean)
        .join(" - ") || null;
  const progress = hireListProgress(row);

  if (fleetLayout) {
    const driverLine =
      row.driver_name?.trim() ||
      row.driver_label?.trim() ||
      row.driver_email?.trim() ||
      row.driver_licence_number?.trim() ||
      null;
    return (
      <article className="rph-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {row.status !== "draft" ? (
              <Link href={`/rental/hires/${row.id}`} className="font-semibold text-rph-fg hover:text-rph-link">
                {title}
              </Link>
            ) : (
              <p className="font-semibold text-rph-fg">{title}</p>
            )}
            {subtitle ? <p className="mt-0.5 text-sm text-rph-fg-muted">{subtitle}</p> : null}
          </div>
          <HireContractRowActionsMenu {...actions} />
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Driver</dt>
            <dd className="text-right text-rph-fg-secondary">{driverLine ?? "—"}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Hire period</dt>
            <dd className="text-right text-rph-fg-secondary">{hireListPeriodLabel(row)}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Rent</dt>
            <dd className="text-right text-rph-fg-secondary">{hireListRentLabel(row)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Progress</dt>
            <dd className="mt-1 space-y-1">
              <WorkflowStatusPill label={progress.label} tone={progress.tone} />
              {progress.detail ? <p className="text-xs text-rph-fg-muted">{progress.detail}</p> : null}
            </dd>
          </div>
        </dl>
      </article>
    );
  }

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
  variant = "table",
  listTab: controlledListTab,
  onListTabChange,
}: Props) {
  const fleetLayout = variant === "fleet";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HireContractStatusFilter>("all");
  const [internalListTab, setInternalListTab] = useState<HireListTab>("active");
  const listTab = controlledListTab ?? internalListTab;
  const setListTab = onListTabChange ?? setInternalListTab;
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
  }, [search, statusFilter, subcompanyFilter, listTab]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (fleetLayout) {
        if (!hireListMatchesTab(row, listTab)) return false;
      } else if (!hireContractMatchesStatusFilter(row.status, statusFilter)) {
        return false;
      }
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
  }, [rows, search, statusFilter, subcompanyFilter, hideSubcompanyColumn, fleetLayout, listTab]);

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
  const hasFilters = fleetLayout
    ? search.trim().length > 0 || (subcompanyFilter !== "all" && !hideSubcompanyColumn)
    : search.trim().length > 0 || statusFilter !== "all" || subcompanyFilter !== "all";

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
  const tableColumnCount = fleetLayout
    ? (vehicleScoped ? 0 : 1) + 5
    : (vehicleScoped ? 0 : 1) + (hideSubcompanyColumn ? 0 : 1) + 7 + 1;

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setSubcompanyFilter("all");
    setPageIndex(0);
  }

  const fleetFilterTriggerClass = `${rphSelectTriggerClass} h-9 bg-rph-chrome py-0 text-sm`;

  const paginationProps = {
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
  };

  return (
    <div className={fleetLayout ? "space-y-3" : "space-y-4"}>
      <div className={fleetLayout ? "rph-card overflow-hidden p-0" : "flex flex-col gap-3"}>
        {fleetLayout ? (
          <div className="border-b border-rph-border px-4 pt-2 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <nav
                className="-mb-px flex gap-1 overflow-x-auto sm:gap-2 [scrollbar-width:thin]"
                aria-label="Hire list tabs"
              >
                {HIRE_LIST_TAB_OPTIONS.map((tab) => {
                  const active = listTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      className={active ? "rph-tab rph-tab-active" : "rph-tab"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setListTab(tab.value)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
              <div className="flex flex-wrap items-center justify-end gap-2 pb-2.5">
                <HireListSearchInput value={search} onChange={setSearch} />
                {!hideSubcompanyColumn && subcompanyOptions.length > 1 ? (
                  <div className="w-full min-w-[9.5rem] sm:w-auto sm:min-w-[12rem]">
                    <RphSelect
                      value={subcompanyFilter}
                      aria-label="Filter by rental company"
                      triggerClassName={fleetFilterTriggerClass}
                      options={[
                        { value: "all", label: "All companies" },
                        ...subcompanyOptions.map(([id, name]) => ({ value: id, label: name })),
                      ]}
                      onValueChange={setSubcompanyFilter}
                    />
                  </div>
                ) : null}
                {hasFilters ? (
                  <button
                    type="button"
                    className="rph-btn-ghost h-9 min-w-0 px-3 text-sm"
                    onClick={clearFilters}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
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
        )}
        {!fleetLayout && total > 0 ? (
          <p className="rph-muted text-xs">
            {hasFilters
              ? `${total.toLocaleString("en-GB")} matching contracts`
              : `${total.toLocaleString("en-GB")} contracts`}
          </p>
        ) : null}
      </div>

      {actionError ? <p className="rph-alert-error text-sm">{actionError}</p> : null}

      {fleetLayout ? (
        <>
          <div className="space-y-3 lg:hidden">
            {!paginated.length ? (
              <p className="rph-muted py-8 text-center text-sm">
                {hasFilters || listTab !== "all" ? "No hires match this view." : "No contracts found."}
              </p>
            ) : (
              paginated.map((r) => (
                <HireContractMobileCard
                  key={r.id}
                  row={r}
                  vehicleScoped={vehicleScoped}
                  hideSubcompanyColumn={hideSubcompanyColumn}
                  fleetLayout
                  actions={rowActionsProps(r, canWrite, tableBusy, actionHandlers)}
                />
              ))
            )}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-rph-border lg:block">
            <div className="max-h-[min(70vh,42rem)] overflow-auto [scrollbar-width:thin]">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="sticky top-0 z-10 border-b border-rph-border bg-rph-chrome text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    {!vehicleScoped ? (
                      <th className="px-4 py-3 font-semibold">Vehicle &amp; company</th>
                    ) : null}
                    <th className="px-4 py-3 font-semibold">Driver</th>
                    <th className="px-4 py-3 font-semibold">Hire period</th>
                    <th className="px-4 py-3 font-semibold">Rent</th>
                    <th className="px-4 py-3 font-semibold">Progress</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rph-border">
                  {!paginated.length ? (
                    <tr>
                      <td colSpan={tableColumnCount} className="px-4 py-8 text-center text-rph-fg-muted">
                        {hasFilters || listTab !== "all" ? "No hires match this view." : "No contracts found."}
                      </td>
                    </tr>
                  ) : (
                    paginated.map((r) => {
                      const progress = hireListProgress(r);
                      const driverLine =
                        r.driver_name?.trim() ||
                        r.driver_label?.trim() ||
                        r.driver_email?.trim() ||
                        r.driver_licence_number?.trim() ||
                        null;
                      const vehicleMeta = [r.vehicle_label, !hideSubcompanyColumn ? r.subcompany_name : null]
                        .filter(Boolean)
                        .join(" - ");
                      return (
                        <tr key={r.id} className="bg-rph-raised hover:bg-rph-chrome/40">
                          {!vehicleScoped ? (
                            <td className="px-4 py-3 align-top">
                              {r.status !== "draft" ? (
                                <Link
                                  href={`/rental/hires/${r.id}`}
                                  className="font-semibold text-rph-fg hover:text-rph-link"
                                >
                                  {r.vehicle_vrm ?? "—"}
                                </Link>
                              ) : (
                                <span className="font-semibold text-rph-fg">{r.vehicle_vrm ?? "—"}</span>
                              )}
                              <p className="mt-0.5 text-xs text-rph-fg-muted">{vehicleMeta || "—"}</p>
                            </td>
                          ) : null}
                          <td className="px-4 py-3 align-top text-rph-fg-secondary">{driverLine ?? "—"}</td>
                          <td className="px-4 py-3 align-top text-rph-fg-secondary">{hireListPeriodLabel(r)}</td>
                          <td className="px-4 py-3 align-top text-rph-fg-secondary">{hireListRentLabel(r)}</td>
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1">
                              <WorkflowStatusPill label={progress.label} tone={progress.tone} />
                              {progress.detail ? (
                                <p className="text-xs text-rph-fg-muted">{progress.detail}</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-right">
                            <HireContractRowActionsMenu
                              {...rowActionsProps(r, canWrite, tableBusy, actionHandlers)}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <RphTablePaginationBar {...paginationProps} className="rounded-xl border border-rph-border" />
        </>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
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

          <div className="hidden overflow-hidden rounded-xl border border-rph-border lg:block">
            <div className="max-h-[min(70vh,42rem)] overflow-auto [scrollbar-width:thin]">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="sticky top-0 z-10 border-b border-rph-border bg-rph-chrome text-left text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    {!vehicleScoped ? <th className="px-4 py-3 font-semibold">Vehicle</th> : null}
                    {!hideSubcompanyColumn ? (
                      <th className="px-4 py-3 font-semibold">Rental company</th>
                    ) : null}
                    <th className="px-4 py-3 font-semibold">Driver</th>
                    <th className="px-4 py-3 font-semibold">Started</th>
                    <th className="px-4 py-3 font-semibold">Ended</th>
                    <th className="px-4 py-3 font-semibold">Rent</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Driver access</th>
                    <th className="px-4 py-3 font-semibold">E-sign</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
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
                      <tr key={r.id} className="bg-rph-raised hover:bg-rph-chrome/40">
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
                          {r.rent_amount_gbp > 0
                            ? `£${r.rent_amount_gbp.toFixed(2)} / ${r.rent_cadence}`
                            : "—"}
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
          </div>

          <RphTablePaginationBar {...paginationProps} className="rounded-xl border border-rph-border" />
        </>
      )}

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
