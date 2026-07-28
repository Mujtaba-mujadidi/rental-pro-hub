"use client";

import { HireSettlementWorkspacePanel } from "@/components/fleet/hire-settlement/hire-settlement-workspace-panel";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireSettlementPage() {
  const { shell } = useHireWorkspace();
  return <HireSettlementWorkspacePanel hireGroupId={shell.hireGroupId} embedded />;
}
