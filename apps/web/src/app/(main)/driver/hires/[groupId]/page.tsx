"use client";

import { DriverHireDashboardSection } from "@/app/(main)/driver/my-hire/driver-hire-dashboard-section";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";
import { useRouter } from "next/navigation";
import { useDriverHireWorkspace } from "./driver-hire-workspace-provider";

export default function DriverHireOverviewPage() {
  const { shell } = useDriverHireWorkspace();
  const router = useRouter();

  return (
    <DriverHireDashboardSection
      hireGroupId={shell.hireGroupId}
      hireStatusLabel={shell.statusLabel}
      startDateLabel={shell.startDateLabel}
      rentLabel={shell.rentLabel}
      onOpenPayments={() => router.push(driverHireWorkspaceHref(shell.hireGroupId, "payments"))}
    />
  );
}
