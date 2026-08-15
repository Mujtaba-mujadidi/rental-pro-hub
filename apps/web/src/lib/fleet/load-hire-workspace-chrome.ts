import { cache } from "react";
import { loadHirePaymentsPageAction } from "@/app/actions/hire-payments";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import {
  buildActiveHirePaymentPosition,
  formatAmountDueChip,
} from "@/lib/fleet/hire-active-summary-display";
import { formatHireRentMetricLabel } from "@/lib/fleet/hire-access-display";
import { formatUkDateTime, ukTodayYmd } from "@/lib/datetime/uk";
import { driverHireStatusLabel } from "@/lib/fleet/driver-hire-nav";
import {
  buildHireEndedHeroMetrics,
  hireEndedSettlementChipLabel,
} from "@/lib/fleet/hire-ended-summary-display";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import { hireContractEndYmd } from "@/lib/fleet/hire-income";
import { hireFrequencyPosition } from "@/lib/fleet/hire-overview-period";
import { loadHireLessorDisplayName } from "@/lib/fleet/hire-lessor-display";
import type { RentCadence } from "@/lib/fleet/hire-types";
import { buildHireWorkspaceHeroMetrics } from "@/lib/fleet/hire-workspace-hero-display";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireWorkspaceChromeResult =
  | { ok: true; chrome: HireWorkspaceChromeData }
  | { ok: false; error: string };

function shortHireId(hireGroupId: string): string {
  return hireGroupId.trim().slice(0, 8);
}

function resolveChromeDriverName(
  profileLabel: string | undefined,
  driverEmail: string | null,
  driverLicence: string | null,
): string | null {
  if (profileLabel && profileLabel !== "Driver" && !profileLabel.includes("@")) {
    return profileLabel;
  }
  return driverEmail ?? driverLicence;
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

/**
 * Chrome for hire workspace tabs — payments + light group fields only.
 * Avoids full hire dashboard (lifecycle attention, charts, audit) on every tab.
 */
async function fetchStaffHireWorkspaceChrome(groupId: string): Promise<HireWorkspaceChromeResult> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = groupId.trim();
  const supabase = await createClient();
  const [paymentsRes, checkout, groupRes] = await Promise.all([
    loadHirePaymentsPageAction(id),
    loadCompletedCheckout(id),
    supabase
      .from("vehicle_hire_groups")
      .select(
        "start_date, start_time, end_time, status, include_deposit, activated_at, terminated_at, ended_at, rent_cadence, rent_amount_gbp, driver_user_id, driver_email, driver_licence_number, vehicles(vrm, make, model), vehicle_hire_agreements(end_date)",
      )
      .eq("id", id)
      .eq("parent_company_id", companyId)
      .maybeSingle(),
  ]);
  if (!paymentsRes.ok) return paymentsRes;
  if (groupRes.error) return { ok: false, error: groupRes.error.message };
  if (!groupRes.data) return { ok: false, error: "Hire not found." };

  const group = groupRes.data;
  const hireStatus = String(group.status ?? paymentsRes.data.hireStatus ?? "");
  const vehicle = group.vehicles as { vrm?: string; make?: string; model?: string } | null;
  const agreementEndDates = (
    (group.vehicle_hire_agreements as { end_date?: string | null }[] | null | undefined) ?? []
  ).map((a) => a.end_date);
  const today = ukTodayYmd();
  const startDate = (group.start_date as string | null) ?? today;
  const includeDeposit = Boolean(group.include_deposit);
  const driverUserId = (group.driver_user_id as string | null) ?? null;
  const driverEmail = (group.driver_email as string | null)?.trim() || null;
  const driverLicence = (group.driver_licence_number as string | null)?.trim() || null;
  const contractEndedYmd = hireContractEndYmd({
    status: hireStatus,
    terminatedAt: (group.terminated_at as string | null) ?? null,
    endedAt: (group.ended_at as string | null) ?? null,
  });
  const contractEnded = Boolean(contractEndedYmd ?? paymentsRes.data.contractEndedYmd);
  const cadence = ((group.rent_cadence as RentCadence | null) ?? "weekly") as RentCadence;
  const hero = buildHireWorkspaceHeroMetrics({
    startDate,
    startTime: (group.start_time as string | null) ?? null,
    endTime: (group.end_time as string | null) ?? null,
    activatedAt: (group.activated_at as string | null) ?? null,
    terminatedAt: (group.terminated_at as string | null) ?? null,
    endedAt: (group.ended_at as string | null) ?? null,
    status: hireStatus,
    rentAmountGbp: group.rent_amount_gbp != null ? Number(group.rent_amount_gbp) : null,
    agreementEndDates,
  });
  const paymentPosition = buildActiveHirePaymentPosition({
    includeDeposit,
    summary: paymentsRes.data.summary,
    paymentRows: paymentsRes.data.rows,
  });
  const amountDueChip = contractEnded ? null : formatAmountDueChip(paymentPosition.currentlyDueGbp);
  const endedHero = contractEnded ? buildHireEndedHeroMetrics({ payments: paymentsRes.data }) : null;
  const settlementStatusChip = contractEnded
    ? hireEndedSettlementChipLabel(paymentsRes.data)
    : null;

  const admin = createSupabaseAdminClient();
  let profileLabel: string | undefined;
  try {
    if (driverUserId) {
      const labels = await loadDriverLabelsMap(admin, [driverUserId]);
      profileLabel = labels.get(driverUserId);
    }
  } catch {
    profileLabel = undefined;
  }
  const lessorName = await loadHireLessorDisplayName(admin, id);
  const driverName = resolveChromeDriverName(profileLabel, driverEmail, driverLicence);

  const vehicleVrm = vehicle?.vrm?.trim() || paymentsRes.data.vehicleVrm;
  const vehicleMakeModel =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || paymentsRes.data.vehicleVrm;

  return {
    ok: true,
    chrome: {
      hireGroupId: id,
      hireGroupIdShort: shortHireId(id),
      vehicleVrm,
      vehicleMakeModel,
      lessorName,
      companyName: null,
      statusLabel: driverHireStatusLabel(hireStatus),
      contractEnded,
      amountDueChip,
      driverName,
      activeSinceLabel: hero.activeSinceLabel,
      contractEndLabel: hero.contractEndLabel,
      dailyRentLabel: hero.dailyRentLabel,
      rentMetricLabel: formatHireRentMetricLabel(cadence),
      frequencyHint: null,
      frequencyPositionLabel: hireFrequencyPosition({
        cadence,
        startDateYmd: startDate,
        referenceYmd: contractEndedYmd ?? today,
        scheduleRows: paymentsRes.data.rows.map((row) => ({
          rowKind: row.rowKind,
          periodStart: row.periodStart,
        })),
      }),
      endedHirePeriodLabel: endedHero?.hirePeriodLabel ?? null,
      endedTimeOnHireLabel: endedHero?.timeOnHireLabel ?? null,
      settlementStatusChip,
      canTerminate: hireStatus === "active",
      includeDeposit,
      checkout,
    },
  };
}

export const getStaffHireWorkspaceChrome = cache(fetchStaffHireWorkspaceChrome);
