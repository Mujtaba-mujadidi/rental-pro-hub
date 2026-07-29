import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getRentalCompanyGateCached } from "@/lib/auth/company-gate-cache";
import { canManageFleetTracking } from "@/lib/auth/rental-permissions";
import { VehicleTrackingPageClient } from "./vehicle-tracking-page-client";

export default async function VehicleTrackingPage() {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  const gate = companyId ? await getRentalCompanyGateCached(companyId) : null;

  return (
    <VehicleTrackingPageClient
      fleetTrackingEnabled={gate?.fleetTrackingEnabled ?? false}
      canManageTracking={canManageFleetTracking(profile)}
    />
  );
}
