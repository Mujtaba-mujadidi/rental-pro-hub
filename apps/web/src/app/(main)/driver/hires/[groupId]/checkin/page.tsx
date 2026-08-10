"use client";

import { HireInspectionsWorkspaceClient } from "@/components/fleet/hire-inspection/hire-inspections-workspace-client";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireCheckinPage() {
  const { shell } = useDriverHireWorkspace();
  return (
    <HireInspectionsWorkspaceClient
      hireGroupId={shell.hireGroupId}
      hireStatus={shell.status}
      vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleMakeModel}`}
      focusKind="checkin"
      audience="driver"
    />
  );
}
