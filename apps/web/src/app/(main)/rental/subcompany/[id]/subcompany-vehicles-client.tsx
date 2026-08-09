"use client";

import type { VehiclesPageData } from "@/app/actions/rental-vehicles";
import { VehiclesView } from "@/app/(main)/rental/vehicles/vehicles-view";

export function SubcompanyVehiclesClient({
  pageData,
  subcompanyId,
}: {
  pageData: VehiclesPageData;
  subcompanyId: string;
}) {
  return (
    <VehiclesView
      vehicles={pageData.vehicles}
      transferredOutVehicles={pageData.transferredOutVehicles}
      subcompanies={pageData.subcompanies}
      notifySettings={pageData.notifySettings}
      canManage={pageData.canManage}
      canDelete={pageData.canDelete}
      lockedSubcompanyId={subcompanyId}
    />
  );
}
