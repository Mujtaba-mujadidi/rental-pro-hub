import { cache } from "react";
import { loadDriverHireDashboardAction } from "@/app/actions/hire-dashboard";
import { loadDriverHirePaymentsPageAction } from "@/app/actions/hire-payments";
import {
  buildActiveHirePaymentPosition,
  formatAmountDueChip,
} from "@/lib/fleet/hire-active-summary-display";
import { formatHireRentMetricLabel } from "@/lib/fleet/hire-access-display";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  buildHireEndedHeroMetrics,
  hireEndedSettlementChipLabel,
} from "@/lib/fleet/hire-ended-summary-display";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { createClient } from "@/lib/supabase/server";

export type DriverHireWorkspaceChromeResult =
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

async function fetchDriverHireWorkspaceChrome(groupId: string): Promise<DriverHireWorkspaceChromeResult> {
  const id = groupId.trim();
  const [dashboardRes, paymentsRes, checkout] = await Promise.all([
    loadDriverHireDashboardAction(id),
    loadDriverHirePaymentsPageAction(id),
    loadCompletedCheckout(id),
  ]);
  if (!dashboardRes.ok) return dashboardRes;
  if (!paymentsRes.ok) return paymentsRes;

  const context = dashboardRes.data.overview;
  const hero = dashboardRes.data.workspaceHero;
  const paymentPosition = buildActiveHirePaymentPosition({
    includeDeposit: dashboardRes.data.includeDeposit,
    summary: dashboardRes.data.summary,
    paymentRows: paymentsRes.data.rows,
    audience: "driver",
  });
  const amountDueChip = context.contractEnded
    ? null
    : formatAmountDueChip(paymentPosition.currentlyDueGbp);
  const endedHero = context.contractEnded
    ? buildHireEndedHeroMetrics({ payments: paymentsRes.data })
    : null;
  const settlementStatusChip = context.contractEnded
    ? hireEndedSettlementChipLabel(paymentsRes.data)
    : null;

  return {
    ok: true,
    chrome: {
      hireGroupId: context.hireGroupId,
      hireGroupIdShort: shortHireId(context.hireGroupId),
      vehicleVrm: context.vehicleVrm,
      vehicleMakeModel: context.vehicleMakeModel,
      lessorName: context.companyName ?? "—",
      companyName: context.companyName,
      statusLabel: context.statusLabel,
      contractEnded: context.contractEnded,
      amountDueChip,
      driverName: null,
      activeSinceLabel: hero.activeSinceLabel,
      contractEndLabel: hero.contractEndLabel,
      dailyRentLabel: hero.dailyRentLabel,
      rentMetricLabel: formatHireRentMetricLabel(context.rentCadence),
      frequencyHint: null,
      frequencyPositionLabel: context.frequencyPositionLabel,
      endedHirePeriodLabel: endedHero?.hirePeriodLabel ?? null,
      endedTimeOnHireLabel: endedHero?.timeOnHireLabel ?? null,
      settlementStatusChip,
      canTerminate: false,
      includeDeposit: paymentsRes.data.rows.some((row) => row.rowKind === "deposit"),
      checkout,
    },
  };
}

export const getDriverHireWorkspaceChrome = cache(fetchDriverHireWorkspaceChrome);
