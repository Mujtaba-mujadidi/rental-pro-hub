import { requireDriverArea } from "@/lib/auth/profile";
import { DriverHireHistoryClient } from "./driver-hire-history-client";

export default async function DriverHireHistoryPage() {
  await requireDriverArea();
  return <DriverHireHistoryClient />;
}
