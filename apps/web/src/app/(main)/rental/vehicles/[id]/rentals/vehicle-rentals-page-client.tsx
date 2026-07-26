"use client";

import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { VehicleRentalsTableView } from "./vehicle-rentals-table-view";

export function VehicleRentalsPageClient() {
  const { vehicleId, shell } = useVehicleWorkspace();

  return (
    <VehicleRentalsTableView
      vehicleId={vehicleId}
      notifyDays={shell.notifySettings.notify_contract_expiry_days_before}
    />
  );
}
