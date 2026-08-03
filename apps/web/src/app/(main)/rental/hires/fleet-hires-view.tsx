"use client";

import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { listHireContractsAction, type HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { HireContractsTable } from "./hire-contracts-table";
import { HireContractWizardModal } from "./hire-contract-wizard-modal";

export function FleetHiresView({
  initialSubcompanyId = null,
  /** When set (e.g. subcompany workspace), filter is locked and chrome stays in-workspace. */
  lockedSubcompanyId = null,
}: {
  initialSubcompanyId?: string | null;
  lockedSubcompanyId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<HireContractTableRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const lockedId = lockedSubcompanyId?.trim() || null;
  const [subcompanyFilter] = useState<string | null>(lockedId ?? initialSubcompanyId);

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
    reload();
  }, [reload]);

  useHireContractsRealtime(reload);

  const visibleRows = useMemo(() => {
    if (!subcompanyFilter) return rows;
    return rows.filter((r) => r.subcompany_id === subcompanyFilter);
  }, [rows, subcompanyFilter]);

  function openNew() {
    setEditDraftId(null);
    setWizardOpen(true);
  }

  function openDraft(id: string) {
    setEditDraftId(id);
    setWizardOpen(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Hires</h1>
        <p className="rph-muted mt-1 text-sm">
          Create and manage vehicle hire contracts. The list updates live when driver access or e-signature progress
          changes.
        </p>
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

      <HireContractsTable
        rows={visibleRows}
        canWrite={canWrite}
        busy={pending}
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
