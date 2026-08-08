"use client";

import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import { FleetHiresView } from "@/app/(main)/rental/hires/fleet-hires-view";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

export function SubcompanyHiresClient({
  initialRows,
  initialCanWrite,
}: {
  initialRows: HireContractTableRow[];
  initialCanWrite: boolean;
}) {
  const { shell } = useSubcompanyWorkspace();
  return (
    <FleetHiresView
      lockedSubcompanyId={shell.subcompany.id}
      initialRows={initialRows}
      initialCanWrite={initialCanWrite}
    />
  );
}
