"use client";

import { DriverHireDetailsSection } from "@/app/(main)/driver/my-hire/driver-hire-details-section";
import { useDriverHireWorkspace } from "../driver-hire-workspace-provider";

export default function DriverHireDetailsPage() {
  const { shell } = useDriverHireWorkspace();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Details</h1>
        <p className="rph-muted mt-1 text-sm">
          Rental terms, vehicle, and your hire agreement for this contract.
        </p>
      </div>
      <DriverHireDetailsSection hireGroupId={shell.hireGroupId} />
    </div>
  );
}
