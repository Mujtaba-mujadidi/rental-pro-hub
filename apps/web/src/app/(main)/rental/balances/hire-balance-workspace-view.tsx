"use client";

import { HireSettlementWorkspacePanel } from "@/components/fleet/hire-settlement/hire-settlement-workspace-panel";

export function HireBalanceWorkspaceView({ hireGroupId }: { hireGroupId: string }) {
  return <HireSettlementWorkspacePanel hireGroupId={hireGroupId} />;
}
