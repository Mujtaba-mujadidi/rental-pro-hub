"use client";

import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";
import { listHireContractsAction, type HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { HireContractsTable } from "./hire-contracts-table";
import { HireContractWizardModal } from "./hire-contract-wizard-modal";

export function FleetHiresView() {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<HireContractTableRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);

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

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <HireContractsTable
        rows={rows}
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
        }}
        onSaved={reload}
      />
    </div>
  );
}
