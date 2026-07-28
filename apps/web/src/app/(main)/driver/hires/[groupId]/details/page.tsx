"use client";

import { DriverHireDetailsSection } from "@/app/(main)/driver/my-hire/driver-hire-details-section";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireDetailsPage() {
  const { shell } = useDriverHireWorkspace();
  return <DriverHireDetailsSection hireGroupId={shell.hireGroupId} />;
}
