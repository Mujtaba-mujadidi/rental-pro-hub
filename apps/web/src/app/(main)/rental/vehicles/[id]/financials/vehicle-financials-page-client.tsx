"use client";

import { useEffect } from "react";
import { VehicleFinancialsView } from "@/app/(main)/rental/vehicles/[id]/financials/vehicle-financials-view";
import { VehicleTabLoader } from "@/app/(main)/rental/vehicles/[id]/vehicle-tab-loader";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";

export function VehicleFinancialsPageClient() {
  const { financials, ensureFinancials, reloadFinancials, refreshShell, invalidateMaintenance } =
    useVehicleWorkspace();

  useEffect(() => {
    void ensureFinancials();
  }, [ensureFinancials]);

  async function handleDataChange() {
    invalidateMaintenance();
    await Promise.all([reloadFinancials(), refreshShell()]);
  }

  if (financials.loading && !financials.data) {
    return <VehicleTabLoader label="Loading financials…" />;
  }

  if (financials.error && !financials.data) {
    return <p className="rph-alert-error text-sm">{financials.error}</p>;
  }

  if (!financials.data) return null;

  return <VehicleFinancialsView initial={financials.data} onDataChange={handleDataChange} />;
}
