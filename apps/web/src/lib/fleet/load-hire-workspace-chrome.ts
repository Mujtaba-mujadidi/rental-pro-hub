import { cache } from "react";
import { loadHireDashboardAction } from "@/app/actions/hire-dashboard";
import { loadHirePaymentsPageAction } from "@/app/actions/hire-payments";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import {
  buildActiveHirePaymentPosition,
  formatAmountDueChip,
} from "@/lib/fleet/hire-active-summary-display";
import { formatHireRentMetricLabel } from "@/lib/fleet/hire-access-display";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { loadHireLessorDisplayName } from "@/lib/fleet/hire-lessor-display";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireWorkspaceChromeResult =
  | { ok: true; chrome: HireWorkspaceChromeData }
  | { ok: false; error: string };

function shortHireId(hireGroupId: string): string {
  return hireGroupId.trim().slice(0, 8);
}

async function loadCompletedCheckout(hireGroupId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_hire_inspections")
    .select("odometer_reading, fuel_level, completed_at")
    .eq("hire_group_id", hireGroupId.trim())
    .eq("kind", "checkout")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    odometerMiles: data.odometer_reading,
    fuelLevelPercent: data.fuel_level,
    completedAtLabel: data.completed_at ? formatUkDateTime(data.completed_at) : null,
  };
}

async function fetchStaffHireWorkspaceChrome(groupId: string): Promise<HireWorkspaceChromeResult> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const id = groupId.trim();
  const [dashboardRes, paymentsRes, checkout] = await Promise.all([
    loadHireDashboardAction(id),
    loadHirePaymentsPageAction(id),
    loadCompletedCheckout(id),
  ]);
  if (!dashboardRes.ok) return dashboardRes;
  if (!paymentsRes.ok) return paymentsRes;

  const admin = createSupabaseAdminClient();
  const lessorName = await loadHireLessorDisplayName(admin, id);
  const context = dashboardRes.data.overview;
  const hero = dashboardRes.data.workspaceHero;
  const paymentPosition = buildActiveHirePaymentPosition({
    dashboard: dashboardRes.data,
    paymentRows: paymentsRes.data.rows,
  });
  const amountDueChip = context.contractEnded
    ? null
    : formatAmountDueChip(paymentPosition.currentlyDueGbp);

  return {
    ok: true,
    chrome: {
      hireGroupId: context.hireGroupId,
      hireGroupIdShort: shortHireId(context.hireGroupId),
      vehicleVrm: context.vehicleVrm,
      vehicleMakeModel: context.vehicleMakeModel,
      lessorName,
      statusLabel: context.statusLabel,
      contractEnded: context.contractEnded,
      amountDueChip,
      driverName: context.driverName,
      activeSinceLabel: hero.activeSinceLabel,
      contractEndLabel: hero.contractEndLabel,
      dailyRentLabel: hero.dailyRentLabel,
      rentMetricLabel: formatHireRentMetricLabel(context.rentCadence),
      frequencyHint: null,
      canTerminate: dashboardRes.data.canTerminate,
      includeDeposit: dashboardRes.data.includeDeposit,
      checkout,
    },
  };
}

export const getStaffHireWorkspaceChrome = cache(fetchStaffHireWorkspaceChrome);
