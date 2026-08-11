"use client";

import { DriverHirePaymentsSection } from "@/app/(main)/driver/my-hire/driver-hire-payments-section";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHirePaymentsPage() {
  const { shell, chrome } = useDriverHireWorkspace();
  const contractEnded = shell.status === "terminated" || shell.status === "completed";

  if (!contractEnded) {
    return <DriverHirePaymentsSection hireGroupId={shell.hireGroupId} chrome={chrome} />;
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="rph-h1">Payments & settlement</h1>
        <p className="rph-muted mt-1 text-sm">
          Summary of rent during your contract, money in and out after it ended, and your payment schedule.
        </p>
      </div>
      <DriverHirePaymentsSection hireGroupId={shell.hireGroupId} chrome={chrome} />
    </div>
  );
}
