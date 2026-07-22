"use client";

import { useHireContractsRealtime } from "@/hooks/use-hire-realtime";
import { useCallback, useEffect, useState, useTransition } from "react";
import { listHireContractsAction, type HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { HireContractsTable } from "@/app/(main)/rental/hires/hire-contracts-table";
import { HireContractWizardModal } from "@/app/(main)/rental/hires/hire-contract-wizard-modal";

type Props = {
  vehicleId: string;
  notifyDays: number;
};

export function VehicleRentalsTableView({ vehicleId, notifyDays }: Props) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<HireContractTableRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await listHireContractsAction("", vehicleId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.rows);
      setCanWrite(res.canWrite);
      setError(null);
    });
  }, [vehicleId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useHireContractsRealtime(reload, { vehicleId });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-rph-fg">Hire contracts</h2>
        <p className="rph-meta mt-0.5">
          Contracts for this vehicle. The list updates live when driver access or e-signature progress changes.
        </p>
      </div>
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <HireContractsTable
        rows={rows}
        canWrite={canWrite}
        busy={pending}
        vehicleScoped
        onNewContract={() => {
          setEditDraftId(null);
          setWizardOpen(true);
        }}
        onOpenDraft={(id) => {
          setEditDraftId(id);
          setWizardOpen(true);
        }}
        onRefresh={reload}
      />
      <HireContractWizardModal
        open={wizardOpen}
        hireGroupId={editDraftId}
        initialVehicleId={vehicleId}
        onClose={() => {
          setWizardOpen(false);
          setEditDraftId(null);
        }}
        onSaved={reload}
      />
    </div>
  );
}
