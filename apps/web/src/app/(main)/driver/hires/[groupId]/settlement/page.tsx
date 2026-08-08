"use client";

import { HireDriverSettlementPanel } from "@/components/fleet/hire-settlement/hire-driver-settlement-panel";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireSettlementPage() {
  const { shell } = useDriverHireWorkspace();

  return (
    <HireDriverSettlementPanel
      hireGroupId={shell.hireGroupId}
      companyName={shell.companyName}
      terminatedAtLabel={shell.terminatedAtLabel}
      embedded
    />
  );
}
