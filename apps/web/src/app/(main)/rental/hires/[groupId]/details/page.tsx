"use client";

import { RentalHireDetailsPanel } from "@/components/fleet/hire-details/hire-details-panel";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireDetailsPage() {
  const { shell } = useHireWorkspace();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Details</h1>
        <p className="rph-muted mt-1 text-sm">
          Rental terms, vehicle, and hirer details for this hire.
        </p>
      </div>
      <RentalHireDetailsPanel hireGroupId={shell.hireGroupId} />
    </div>
  );
}
