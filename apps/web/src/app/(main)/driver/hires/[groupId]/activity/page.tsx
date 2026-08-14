"use client";

import { HireActivityView } from "@/components/fleet/hire-activity/hire-activity-view";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireActivityPage() {
  const { shell } = useDriverHireWorkspace();
  return <HireActivityView hireGroupId={shell.hireGroupId} audience="driver" />;
}
