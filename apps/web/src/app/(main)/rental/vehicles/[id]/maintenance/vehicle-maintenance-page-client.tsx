"use client";

import { useEffect } from "react";
import { VehicleMaintenanceView } from "@/app/(main)/rental/vehicles/[id]/maintenance/vehicle-maintenance-view";
import { VehicleTabLoader } from "@/app/(main)/rental/vehicles/[id]/vehicle-tab-loader";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";

export function VehicleMaintenancePageClient() {
  const { maintenance, ensureMaintenance, reloadMaintenance, refreshShell } = useVehicleWorkspace();

  useEffect(() => {
    void ensureMaintenance();
  }, [ensureMaintenance]);

  async function handleDataChange() {
    await Promise.all([reloadMaintenance(), refreshShell()]);
  }

  if (maintenance.loading && !maintenance.data) {
    return <VehicleTabLoader label="Loading maintenance records…" />;
  }

  if (maintenance.error && !maintenance.data) {
    return <p className="rph-alert-error text-sm">{maintenance.error}</p>;
  }

  if (!maintenance.data) return null;

  return <VehicleMaintenanceView initial={maintenance.data} onDataChange={handleDataChange} />;
}
