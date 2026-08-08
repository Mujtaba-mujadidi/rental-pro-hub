"use client";

import { DriverHirePaymentsSection } from "@/app/(main)/driver/my-hire/driver-hire-payments-section";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHirePaymentsPage() {
  const { shell } = useDriverHireWorkspace();
  const contractEnded = shell.status === "terminated" || shell.status === "completed";

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="rph-h1">{contractEnded ? "Payments & settlement" : "Payments"}</h1>
        <p className="rph-muted mt-1 text-sm">
          {contractEnded
            ? "Summary of rent during your contract, money in and out after it ended, and your payment schedule."
            : "Your rent payment schedule and amounts due for weeks that have started."}
        </p>
      </div>
      <DriverHirePaymentsSection hireGroupId={shell.hireGroupId} />
    </div>
  );
}
