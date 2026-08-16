"use client";

import { useEffect } from "react";
import { VehicleFleetTrackingCard } from "@/app/(main)/rental/vehicles/[id]/vehicle-fleet-tracking-card";
import { VehicleTabLoader } from "@/app/(main)/rental/vehicles/[id]/vehicle-tab-loader";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { FLEET_TRACKING_UNAVAILABLE_COPY } from "@/lib/fleet-tracking/messaging";

export function VehicleTrackingPageClient({
  fleetTrackingEnabled,
  canManageTracking,
}: {
  fleetTrackingEnabled: boolean;
  canManageTracking: boolean;
}) {
  const { shell, tracking, ensureTracking } = useVehicleWorkspace();
  const { vehicle } = shell;

  useEffect(() => {
    if (!fleetTrackingEnabled) return;
    void ensureTracking();
  }, [fleetTrackingEnabled, ensureTracking]);

  if (!fleetTrackingEnabled) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div className="rph-card p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rph-link">
            SmartCar Tracker
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-rph-fg">Not available</h2>
          <p className="rph-muted mt-2 text-sm">{FLEET_TRACKING_UNAVAILABLE_COPY}</p>
        </div>
      </div>
    );
  }

  if (tracking.loading && !tracking.data) {
    return <VehicleTabLoader label="Loading tracker…" />;
  }

  if (tracking.error && !tracking.data) {
    return <p className="rph-alert-error text-sm">{tracking.error}</p>;
  }

  if (!tracking.data) return null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <VehicleFleetTrackingCard
        vehicleId={vehicle.id}
        vehicleLabel={{ vrm: vehicle.vrm, make: vehicle.make, model: vehicle.model }}
        primaryImei={vehicle.gps_primary_imei}
        canManageTracking={canManageTracking}
      />
    </div>
  );
}
