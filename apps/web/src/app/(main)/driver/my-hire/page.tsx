import { requireDriverArea } from "@/lib/auth/profile";
import { DriverMyHireClient } from "./driver-my-hire-client";
import { DriverMyHireProvider } from "./driver-my-hire-provider";

export default async function DriverMyHirePage() {
  await requireDriverArea();
  return (
    <DriverMyHireProvider>
      <DriverMyHireClient />
    </DriverMyHireProvider>
  );
}
