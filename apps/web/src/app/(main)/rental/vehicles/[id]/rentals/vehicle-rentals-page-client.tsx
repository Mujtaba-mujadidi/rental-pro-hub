"use client";

import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { VehicleHiresView } from "./vehicle-hires-view";

export function VehicleRentalsPageClient() {
  const { vehicleId, shell, refreshShell, invalidateOverview } = useVehicleWorkspace();

  return (
    <VehicleHiresView
      vehicleId={vehicleId}
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
