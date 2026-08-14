"use client";

import { HireActivityView } from "@/components/fleet/hire-activity/hire-activity-view";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireActivityPage() {
  const { shell } = useHireWorkspace();
  return <HireActivityView hireGroupId={shell.hireGroupId} audience="staff" />;
}
