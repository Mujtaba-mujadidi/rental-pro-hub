import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { DriverDashboardView } from "@/components/driver/driver-dashboard/driver-dashboard-view";
import { redirect } from "next/navigation";

export default async function DriverHomePage() {
  const { user } = await requireDriverArea();

  const supabase = await createClient();
  const { data: dp } = await supabase
    .from("driver_profiles")
    .select(DRIVER_ONBOARDING_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!driverOnboardingComplete(dp) || !dp) {
    redirect("/driver/onboarding");
  }

  return <DriverDashboardView />;
}
