"use client";

import { DriverHireDashboardSection } from "@/app/(main)/driver/my-hire/driver-hire-dashboard-section";
import { useDriverHireWorkspace } from "./driver-hire-workspace-provider";

export default function DriverHireOverviewPage() {
  const { shell } = useDriverHireWorkspace();
  return (
    <DriverHireDashboardSection hireGroupId={shell.hireGroupId} hireStatus={shell.status} />
  );
}
