"use client";

import { HireInspectionWizard } from "@/components/fleet/hire-inspection/hire-inspection-wizard";
import { useHireWorkspace } from "../hire-workspace-provider";

export function HireCheckinPageClient() {
  const { shell } = useHireWorkspace();
  return (
    <HireInspectionWizard
      hireGroupId={shell.hireGroupId}
      kind="checkin"
      vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
      hireStatus={shell.status}
      vehicleId={shell.vehicleId}
    />
  );
}
