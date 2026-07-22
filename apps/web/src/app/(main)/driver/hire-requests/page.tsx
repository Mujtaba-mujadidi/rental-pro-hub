import { requireDriverArea } from "@/lib/auth/profile";
import { Suspense } from "react";
import { DriverHireRequestsClient } from "./driver-hire-requests-client";

export default async function DriverHireRequestsPage() {
  await requireDriverArea();
  return (
    <Suspense fallback={<p className="rph-muted text-sm">Loading hire requests…</p>}>
      <DriverHireRequestsClient />
    </Suspense>
  );
}
