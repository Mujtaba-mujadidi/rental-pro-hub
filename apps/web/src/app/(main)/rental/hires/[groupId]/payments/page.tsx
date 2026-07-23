"use client";

import { HirePaymentsView } from "@/components/fleet/hire-payments/hire-payments-view";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HirePaymentsPage() {
  const { shell } = useHireWorkspace();
  return <HirePaymentsView hireGroupId={shell.hireGroupId} />;
}
