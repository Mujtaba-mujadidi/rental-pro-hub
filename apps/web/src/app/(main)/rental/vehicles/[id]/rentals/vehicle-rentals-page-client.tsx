"use client";

import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { VehicleRentalsTableView } from "./vehicle-rentals-table-view";

export function VehicleRentalsPageClient() {
  const { vehicleId, shell, refreshShell, invalidateOverview } = useVehicleWorkspace();

  return (
    <VehicleRentalsTableView
      vehicleId={vehicleId}
      notifyDays={shell.notifySettings.notify_contract_expiry_days_before}
      readOnlyHistoric={shell.access.kind === "historic"}
      historicSubcompanyName={
        shell.access.kind === "historic" ? shell.access.transfer.from_name ?? null : null
      }
      onHireListChanged={() => {
        invalidateOverview();
        void refreshShell();
      }}
    />
  );
}
