"use client";

import { HireEndHireWorkspaceView } from "@/components/fleet/hire-termination/hire-end-hire-workspace-view";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireEndHirePage() {
  const { shell } = useHireWorkspace();
  return <HireEndHireWorkspaceView hireGroupId={shell.hireGroupId} />;
}
