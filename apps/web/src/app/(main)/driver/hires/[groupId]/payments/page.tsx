"use client";

import { DriverHirePaymentsSection } from "@/app/(main)/driver/my-hire/driver-hire-payments-section";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHirePaymentsPage() {
  const { shell } = useDriverHireWorkspace();
  return <DriverHirePaymentsSection hireGroupId={shell.hireGroupId} />;
}
