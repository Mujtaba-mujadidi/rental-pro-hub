"use client";

import { HireInspectionWizard } from "@/components/fleet/hire-inspection/hire-inspection-wizard";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireCheckoutPage() {
  const { shell } = useDriverHireWorkspace();
  return (
    <HireInspectionWizard
      hireGroupId={shell.hireGroupId}
      kind="checkout"
      vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleMakeModel}`}
      hireStatus={shell.status}
      audience="driver"
    />
  );
}
