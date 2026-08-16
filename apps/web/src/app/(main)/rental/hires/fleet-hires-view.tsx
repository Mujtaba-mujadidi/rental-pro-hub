"use client";

import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { listHireContractsAction, type HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import {
  buildHireListStats,
  defaultHireListTab,
  type HireListTab,
} from "@/lib/fleet/hire-list-tabs";
import { HireContractsTable } from "./hire-contracts-table";
import { HireContractWizardModal } from "./hire-contract-wizard-modal";

export function FleetHiresView({
  initialSubcompanyId = null,
  /** When set (e.g. subcompany workspace), filter is locked and chrome stays in-workspace. */
  lockedSubcompanyId = null,
  initialRows,
  initialCanWrite,
}: {
  initialSubcompanyId?: string | null;
  lockedSubcompanyId?: string | null;
  initialRows?: HireContractTableRow[];
  initialCanWrite?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<HireContractTableRow[]>(initialRows ?? []);
  const [canWrite, setCanWrite] = useState(initialCanWrite ?? false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const lockedId = lockedSubcompanyId?.trim() || null;
  const [subcompanyFilter] = useState<string | null>(lockedId ?? initialSubcompanyId);
  const hasInitialRows = initialRows !== undefined;
  const [listTab, setListTab] = useState<HireListTab | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await listHireContractsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.rows);
      setCanWrite(res.canWrite);
      setError(null);
    });
  }, []);

  useEffect(() => {
    if (!hasInitialRows) {
      reload();
    }
  }, [hasInitialRows, reload]);

  useHireContractsRealtime(reload);

  const visibleRows = useMemo(() => {
    if (!subcompanyFilter) return rows;
    return rows.filter((r) => r.subcompany_id === subcompanyFilter);
  }, [rows, subcompanyFilter]);

  const stats = useMemo(() => buildHireListStats(visibleRows), [visibleRows]);

  useEffect(() => {
    setListTab((current) => current ?? defaultHireListTab(stats));
  }, [stats]);

  const activeTab = listTab ?? defaultHireListTab(stats);

  function openNew() {
    setEditDraftId(null);
    setWizardOpen(true);
  }

  function openDraft(id: string) {
    setEditDraftId(id);
    setWizardOpen(true);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="rph-h1">Hires</h1>
          <p className="rph-muted mt-1 text-sm">
            Manage agreements, driver access and payments from one focused list.
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="rph-btn-primary shrink-0"
            disabled={pending}
            onClick={openNew}
          >
            New hire
          </button>
        ) : null}
      </div>

      {subcompanyFilter && !lockedId ? (
        <div className="rph-alert-ok flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>Showing hires for the selected subcompany.</p>
          <Link href="/rental/hires" className="rph-link text-sm">
            Clear filter
          </Link>
        </div>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="rph-card overflow-hidden p-0">
        <dl className="grid grid-cols-1 divide-y divide-rph-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5 hover:bg-rph-chrome/40"
            onClick={() => setListTab("active")}
          >
            <dt className="text-sm text-rph-fg-muted">Active</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.activeCount.toLocaleString("en-GB")}
            </dd>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5 hover:bg-rph-chrome/40"
            onClick={() => setListTab("scheduled")}
          >
            <dt className="text-sm text-rph-fg-muted">Scheduled</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.scheduledCount.toLocaleString("en-GB")}
            </dd>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5 hover:bg-rph-chrome/40"
            onClick={() => setListTab("ended")}
          >
            <dt className="text-sm text-rph-fg-muted">Completed this month</dt>
            <dd className="text-base font-semibold tabular-nums text-rph-fg">
              {stats.completedThisMonthCount.toLocaleString("en-GB")}
            </dd>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5 hover:bg-rph-chrome/40"
            onClick={() => setListTab("needs_action")}
          >
            <dt className="text-sm text-rph-fg-muted">Needs action</dt>
            <dd
              className={`text-base font-semibold tabular-nums ${
                stats.needsActionCount > 0 ? "text-red-700 dark:text-red-300" : "text-rph-fg"
              }`}
            >
              {stats.needsActionCount.toLocaleString("en-GB")}
            </dd>
          </button>
        </dl>
      </section>

      <HireContractsTable
        variant="fleet"
        listTab={activeTab}
        onListTabChange={setListTab}
        rows={visibleRows}
        canWrite={canWrite}
        busy={pending && !hasInitialRows}
        hideSubcompanyColumn={Boolean(lockedId)}
        onNewContract={openNew}
        onOpenDraft={openDraft}
        onRefresh={reload}
      />

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
    </div>
  );
}
