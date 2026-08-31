"use client";

import { saveHireEndHireDraftAction } from "@/app/actions/hire-end-hire";
import { HireInspectionsWorkspaceClient } from "@/components/fleet/hire-inspection/hire-inspections-workspace-client";
import { useHireWorkspace } from "../hire-workspace-provider";
import { useRouter } from "next/navigation";

function isEndHireCloseout(status: string): boolean {
  return status === "ending" || status === "terminated" || status === "completed";
}

export function HireCheckinPageClient() {
  const { shell } = useHireWorkspace();
  const router = useRouter();

  async function onCheckinComplete() {
    if (isEndHireCloseout(shell.status)) {
      const res = await saveHireEndHireDraftAction({
        hireGroupId: shell.hireGroupId,
        step: "final_account",
      });
      if (!res.ok) return;
      router.push(`/rental/hires/${shell.hireGroupId}/end-hire`);
      router.refresh();
      return;
    }
    router.push(`/rental/hires/${shell.hireGroupId}`);
    router.refresh();
  }

  return (
    <HireInspectionsWorkspaceClient
      hireGroupId={shell.hireGroupId}
      hireStatus={shell.status}
      vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
      vehicleId={shell.vehicleId}
      focusKind="checkin"
      audience="staff"
      onCheckinComplete={onCheckinComplete}
    />
  );
}
