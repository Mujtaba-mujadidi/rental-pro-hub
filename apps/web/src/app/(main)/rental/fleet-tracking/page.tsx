import { redirect } from "next/navigation";
import { FleetTrackingClient } from "@/app/(main)/rental/fleet-tracking/fleet-tracking-client";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canManageFleetTracking } from "@/lib/auth/rental-permissions";
import { loadCompanyFleetTracking } from "@/lib/fleet-tracking/credentials";

export default async function FleetTrackingPage() {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) redirect("/rental");

  const row = await loadCompanyFleetTracking(companyId);
  if (!row?.fleet_tracking_enabled) {
    // Soft page still renders messaging via client; allow access so users see why nav might appear after enable
  }

  return <FleetTrackingClient canManage={canManageFleetTracking(profile)} />;
}
