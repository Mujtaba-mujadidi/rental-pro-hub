"use client";

import { VehicleDetailsView } from "@/app/(main)/rental/vehicles/[id]/details/vehicle-details-view";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";

export function VehicleDetailsPageClient() {
  const { shell } = useVehicleWorkspace();

  return (
    <VehicleDetailsView
      initialVehicle={shell.vehicle}
      initialDocuments={shell.documents}
      initialTransfers={shell.transfers}
      subcompanies={shell.subcompanies}
      notifySettings={shell.notifySettings}
      canManage={shell.canManage}
      canDelete={shell.canDelete}
    />
  );
}
