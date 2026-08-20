import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import {
  buildActiveHirePaymentPosition,
  formatAmountDueChip,
} from "@/lib/fleet/hire-active-summary-display";
import { formatHireRentMetricLabel } from "@/lib/fleet/hire-access-display";
import { formatUkDateTime, ukTodayYmd } from "@/lib/datetime/uk";
import { isDepositDispositionPending } from "@/lib/fleet/hire-deposit-resolution";
import { driverHireStatusLabel } from "@/lib/fleet/driver-hire-nav";
import {
  buildHireEndedHeroMetrics,
  hireEndedSettlementChipLabel,
} from "@/lib/fleet/hire-ended-summary-display";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import {
  mapDriverChargeLineItemsFromDb,
  outstandingExtraChargesGbp,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import { hireContractEndYmd } from "@/lib/fleet/hire-income";
import { hireFrequencyPosition } from "@/lib/fleet/hire-overview-period";
import { loadHireLessorDisplayName } from "@/lib/fleet/hire-lessor-display";
import { enrichHirePaymentRows, summarizeHirePayments } from "@/lib/fleet/hire-payment-summary";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { buildHireWorkspaceHeroMetrics } from "@/lib/fleet/hire-workspace-hero-display";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { hireAllowsCompanyDriverPackageAccess } from "@/lib/fleet/hire-driver-package-access";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";
import { canStartCheckin, canTerminateHire } from "@/lib/fleet/hire-lifecycle-attention";
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

async function loadCheckinCompleted(hireGroupId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_hire_inspections")
    .select("id")
    .eq("hire_group_id", hireGroupId.trim())
    .eq("kind", "checkin")
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Hero chips only — not the full payments page (accounts, events, settlement ledger).
 */
async function loadHireChromePaymentGlance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hireGroupId: string,
): Promise<{
  summary: ReturnType<typeof summarizeHirePayments>;
  paymentRows: Array<{ rowKind: "rent" | "deposit"; balanceGbp: number; netDueGbp: number }>;
  extraChargesOutstandingGbp: number;
  frequencyRows: Array<{ rowKind: "rent" | "deposit"; periodStart: string }>;
} | null> {
  const [{ data: schedule }, { data: chargeRows }, { data: balancePayments }] = await Promise.all([
    supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .eq("hire_group_id", hireGroupId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("vehicle_hire_driver_charge_line_items")
      .select("id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at")
      .eq("hire_group_id", hireGroupId),
    supabase
      .from("vehicle_hire_balance_payments")
      .select("amount_gbp, direction, payment_category")
      .eq("hire_group_id", hireGroupId),
  ]);

  const today = ukTodayYmd();
  const inputs = (schedule ?? []).map((row) => {
    const discounts = (row.vehicle_hire_schedule_discounts as { amount_gbp?: number }[] | null) ?? [];
    const discountTotalGbp = discounts.reduce((sum, d) => sum + Number(d.amount_gbp ?? 0), 0);
    return {
      id: row.id as string,
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      rowKind: row.row_kind === "deposit" ? ("deposit" as const) : ("rent" as const),
      baseAmountGbp: Number(row.base_amount_gbp),
      discountTotalGbp,
      paymentStatus: row.payment_status as HirePaymentStatus,
      approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
      pendingSubmittedGbp: null,
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
  const enriched = enrichHirePaymentRows(inputs, today);
  const summary = summarizeHirePayments(inputs, today);
  const extraChargesOutstandingGbp = outstandingExtraChargesGbp(
    mapDriverChargeLineItemsFromDb((chargeRows ?? []) as DriverChargeLineItemDbRow[]),
    (balancePayments ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    })),
  );
  return {
    summary,
    paymentRows: enriched.map((row) => ({
      rowKind: row.rowKind,
      balanceGbp: row.balanceGbp,
      netDueGbp: row.netDueGbp,
    })),
    extraChargesOutstandingGbp,
    frequencyRows: enriched.map((row) => ({ rowKind: row.rowKind, periodStart: row.periodStart })),
  };
}

/**
 * Chrome for hire workspace tabs. Uses a payment glance, not the full payments page.
 */
async function fetchStaffHireWorkspaceChrome(groupId: string): Promise<HireWorkspaceChromeResult> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = groupId.trim();
  const supabase = await createClient();
  const admin = createSupabaseAdminClient();
  const [checkout, checkinCompleted, groupRes, lessorName, glance] = await Promise.all([
    loadCompletedCheckout(id),
    loadCheckinCompleted(id),
    supabase
      .from("vehicle_hire_groups")
      .select(
        "start_date, start_time, end_time, status, include_deposit, activated_at, terminated_at, ended_at, rent_cadence, rent_amount_gbp, driver_user_id, driver_email, driver_licence_number, driver_access_status, driver_documents_retain_until, termination_settlement, settlement_balance_gbp, settlement_balance_direction, deposit_disposition, vehicles(vrm, make, model), vehicle_hire_agreements(end_date)",
      )
      .eq("id", id)
      .eq("parent_company_id", companyId)
      .maybeSingle(),
    loadHireLessorDisplayName(admin, id),
    loadHireChromePaymentGlance(supabase, id),
  ]);
  if (groupRes.error) return { ok: false, error: "Could not load hire." };
  if (!groupRes.data) return { ok: false, error: "Hire not found." };

  const group = groupRes.data;
  const includeDeposit = Boolean(group.include_deposit);
  const paymentPosition = glance
    ? buildActiveHirePaymentPosition({
        includeDeposit,
        summary: glance.summary,
        paymentRows: glance.paymentRows,
        extraChargesOutstandingGbp: glance.extraChargesOutstandingGbp,
      })
    : null;

  const hireStatus = String(group.status ?? "");
  const vehicle = group.vehicles as { vrm?: string; make?: string; model?: string } | null;
  const agreementEndDates = (
    (group.vehicle_hire_agreements as { end_date?: string | null }[] | null | undefined) ?? []
  ).map((a) => a.end_date);
  const today = ukTodayYmd();
  const startDate = (group.start_date as string | null) ?? today;
  const driverUserId = (group.driver_user_id as string | null) ?? null;
  const driverEmail = (group.driver_email as string | null)?.trim() || null;
  const driverLicence = (group.driver_licence_number as string | null)?.trim() || null;
  const contractEndedYmd = hireContractEndYmd({
    status: hireStatus,
    terminatedAt: (group.terminated_at as string | null) ?? null,
    endedAt: (group.ended_at as string | null) ?? null,
  });
  const contractEnded = Boolean(contractEndedYmd);
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
  const amountDueChip = contractEnded ? null : formatAmountDueChip(paymentPosition?.currentlyDueGbp ?? 0);
  const endedHero = contractEnded
    ? buildHireEndedHeroMetrics({
        payments: {
          contractEndedYmd,
          terminationSummary: (group.termination_settlement as HireTerminationAccountsSummary | null) ?? null,
        },
      })
    : null;
  const settlementStatusChip = contractEnded
    ? hireEndedSettlementChipLabel({
        depositPendingReview: isDepositDispositionPending((group.deposit_disposition as string | null) ?? null),
        settlementBalance: computeHireWorkspaceSettlementBalance({
          settlementBalanceDirection: (group.settlement_balance_direction as string | null) ?? null,
          settlementBalanceGbp: Number(group.settlement_balance_gbp ?? 0),
        }),
      })
    : null;

  let profileLabel: string | undefined;
  const mayLoadLiveDriverProfile = hireAllowsCompanyDriverPackageAccess({
    driverAccessStatus: (group.driver_access_status as string | null) ?? null,
    hireStatus,
    retainUntilYmd: (group.driver_documents_retain_until as string | null) ?? null,
    todayYmd: today,
  });
  try {
    if (driverUserId && mayLoadLiveDriverProfile) {
      const labels = await loadDriverLabelsMap(admin, [driverUserId]);
      profileLabel = labels.get(driverUserId);
    }
  } catch {
    profileLabel = undefined;
  }
  const driverName = mayLoadLiveDriverProfile
    ? resolveChromeDriverName(profileLabel, driverEmail, driverLicence)
    : null;

  const vehicleVrm = vehicle?.vrm?.trim() || "—";
  const vehicleMakeModel = [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || vehicleVrm;

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
        scheduleRows: glance?.frequencyRows ?? [],
      }),
      endedHirePeriodLabel: endedHero?.hirePeriodLabel ?? null,
      endedTimeOnHireLabel: endedHero?.timeOnHireLabel ?? null,
      settlementStatusChip,
      canTerminate: canTerminateHire(hireStatus),
      canCheckIn: canStartCheckin({
        status: hireStatus,
        checkoutCompleted: Boolean(checkout),
        checkinCompleted,
      }),
      includeDeposit,
      checkout,
    },
  };
}

export const getStaffHireWorkspaceChrome = cache(fetchStaffHireWorkspaceChrome);
