"use client";

import { VehicleDetailsView } from "@/app/(main)/rental/vehicles/[id]/details/vehicle-details-view";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";

export function VehicleDetailsPageClient() {
  const { shell } = useVehicleWorkspace();
  const historicTransfer = shell.access.kind === "historic" ? shell.access.transfer : null;

  return (
    <VehicleDetailsView
      initialVehicle={shell.vehicle}
      initialDocuments={shell.documents}
      initialDocumentHistory={shell.documentHistory}
      initialTransfers={shell.transfers}
      transferDocumentRequirements={shell.transferDocumentRequirements}
      subcompanies={shell.subcompanies}
      notifySettings={shell.notifySettings}
      canManage={shell.canManage}
      canDelete={shell.canDelete}
      readOnlyHistoric={shell.access.kind === "historic"}
      historicTransfer={historicTransfer}
    />
  );
}
