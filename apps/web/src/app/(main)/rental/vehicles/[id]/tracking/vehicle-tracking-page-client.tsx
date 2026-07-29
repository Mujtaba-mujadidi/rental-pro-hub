"use client";

import { VehicleFleetTrackingCard } from "@/app/(main)/rental/vehicles/[id]/vehicle-fleet-tracking-card";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { FLEET_TRACKING_UNAVAILABLE_COPY } from "@/lib/fleet-tracking/messaging";

export function VehicleTrackingPageClient({
  fleetTrackingEnabled,
  canManageTracking,
}: {
  fleetTrackingEnabled: boolean;
  canManageTracking: boolean;
}) {
  const { shell } = useVehicleWorkspace();
  const { vehicle } = shell;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Tracking</h1>
        <p className="rph-muted mt-1 text-sm">Live GPS and mileage from SmartCar Tracker for this vehicle.</p>
      </div>

      {!fleetTrackingEnabled ? (
        <div className="rph-card p-6">
          <p className="text-sm font-semibold text-rph-fg">SmartCar Tracker</p>
          <p className="rph-muted mt-2 text-sm">{FLEET_TRACKING_UNAVAILABLE_COPY}</p>
        </div>
      ) : (
        <VehicleFleetTrackingCard
          vehicleId={vehicle.id}
          vehicleLabel={{ vrm: vehicle.vrm, make: vehicle.make, model: vehicle.model }}
          canManageTracking={canManageTracking}
        />
      )}
    </div>
  );
}
