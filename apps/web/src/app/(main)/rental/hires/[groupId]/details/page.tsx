"use client";

import { RentalHireDetailsPanel } from "@/components/fleet/hire-details/hire-details-panel";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireDetailsPage() {
  const { shell } = useHireWorkspace();

  return <RentalHireDetailsPanel hireGroupId={shell.hireGroupId} />;
}
