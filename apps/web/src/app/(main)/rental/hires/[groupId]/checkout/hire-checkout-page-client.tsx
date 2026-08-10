"use client";

import { HireInspectionsWorkspaceClient } from "@/components/fleet/hire-inspection/hire-inspections-workspace-client";
import { useHireWorkspace } from "../hire-workspace-provider";

export function HireCheckoutPageClient() {
  const { shell } = useHireWorkspace();
  return (
    <HireInspectionsWorkspaceClient
      hireGroupId={shell.hireGroupId}
      hireStatus={shell.status}
      vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
      vehicleId={shell.vehicleId}
      focusKind="checkout"
      audience="staff"
    />
  );
}
