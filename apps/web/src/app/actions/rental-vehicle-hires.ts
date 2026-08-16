"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadMaintenance, canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { getVehicleWorkspaceShell } from "@/lib/fleet/load-vehicle-workspace-shell";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import { ACTIVE_HIRE_GROUP_STATUSES, type HireGroupStatus, type RentCadence } from "@/lib/fleet/hire-types";
import type { SettlementBalanceDirection } from "@/lib/fleet/hire-termination-summary";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  buildPaymentRowEventStateMap,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import type { DashboardScheduleFact } from "@/lib/fleet/company-dashboard-display";
import {
  countVehicleHires,
  daysSinceVehicleAdded,
  hireUtilisationPercent,
  mapVehicleHireToDashboardFact,
  pickCurrentOpenHireId,
  sumVehicleHireDays,
  vehicleHiresAmountDueGbp,
} from "@/lib/fleet/vehicle-hires-page";
import { loadVehicleHireIncomeNetGbp } from "@/app/actions/rental-vehicle-financials";

export type VehicleHiresCurrentHire = {
  hireGroupId: string;
  status: HireGroupStatus;
  driverLabel: string;
  startDate: string;
  endDate: string | null;
  rentAmountGbp: number;
  rentCadence: RentCadence;
  depositGbp: number | null;
  agreementLabel: string;
  driverAccessStatus: string;
  canViewSignedDocuments: boolean;
};

export type VehicleHiresSettlement = {
  direction: SettlementBalanceDirection;
  amountGbp: number;
};

export type VehicleHiresPageStats = {
  totalHires: number;
  hireDays: number;
  utilisationPercent: number | null;
  hireIncomeGbp: number | null;
  outstandingGbp: number;
};

export type VehicleHiresPageData = {
  currentHire: VehicleHiresCurrentHire | null;
  stats: VehicleHiresPageStats;
  settlementsByGroupId: Record<string, VehicleHiresSettlement>;
  canWrite: boolean;
};

function agreementLabelFor(agreements: { signed_at: string | null }[]): string {
  if (!agreements.length) return "—";
  const signed = agreements.filter((a) => Boolean(a.signed_at)).length;
  if (signed === agreements.length) return "Fully signed";
  if (signed === 0) return "Awaiting signature";
  return `${signed}/${agreements.length} signed`;
}

function rentBillingModeFromSettlement(
  terminationSettlement: unknown,
): HireTerminationRentBillingMode | null {
  const mode =
    terminationSettlement && typeof terminationSettlement === "object"
      ? (terminationSettlement as { rentBillingMode?: string }).rentBillingMode
      : null;
  if (mode === "actual" || mode === "end_of_period") return mode;
  return null;
}

/**
 * Hires tab summary for a vehicle workspace.
 * Auth: vehicle shell (tenant + subcompany scope) + rentals.read for hire PII.
 * Hire income uses the same net figure as Financials when maintenance.read is allowed.
 * Outstanding uses the same amount-due rules as the company dashboard.
 */
export async function loadVehicleHiresPageAction(
  vehicleId: string,
): Promise<{ ok: true; data: VehicleHiresPageData } | { ok: false; error: string }> {
  const shell = await getVehicleWorkspaceShell(vehicleId);
  if (!shell.ok) return { ok: false, error: shell.error };

  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) {
    return { ok: false, error: "You do not have permission to view rentals." };
  }

  const id = vehicleId.trim();
  const supabase = await createClient();
  const openStatuses = ["draft", ...ACTIVE_HIRE_GROUP_STATUSES] as const;
  const todayYmd = ukTodayYmd();

  const { data: groups, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, start_date, activated_at, ended_at, terminated_at, rent_cadence, rent_amount_gbp, deposit_gbp, driver_user_id, driver_access_status, settlement_balance_direction, settlement_balance_gbp, termination_settlement, created_at, updated_at, vehicle_hire_agreements(id, end_date, signed_at)",
    )
    .eq("vehicle_id", id)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return { ok: false, error: error.message };

  const rows = groups ?? [];

  const settlementsByGroupId: Record<string, VehicleHiresSettlement> = {};
  for (const g of rows) {
    const direction = ((g.settlement_balance_direction as string | null) ??
      "settled") as SettlementBalanceDirection;
    settlementsByGroupId[g.id as string] = {
      direction,
      amountGbp: Number(g.settlement_balance_gbp ?? 0) || 0,
    };
  }

  const hireDayInputs = rows.map((g) => ({
    status: String(g.status ?? ""),
    start_date: (g.start_date as string | null) ?? null,
    activated_at: (g.activated_at as string | null) ?? null,
    ended_at: (g.ended_at as string | null) ?? null,
    terminated_at: (g.terminated_at as string | null) ?? null,
  }));
  const hireDays = sumVehicleHireDays(hireDayInputs, todayYmd);
  const daysSinceAdded = daysSinceVehicleAdded(shell.vehicle.created_at, todayYmd);

  const hireFacts = rows.map((g) =>
    mapVehicleHireToDashboardFact({
      id: g.id as string,
      vehicleId: id,
      subcompanyId: shell.vehicle.subcompany_id,
      status: String(g.status ?? ""),
      start_date: (g.start_date as string | null) ?? null,
      activated_at: (g.activated_at as string | null) ?? null,
      ended_at: (g.ended_at as string | null) ?? null,
      terminated_at: (g.terminated_at as string | null) ?? null,
      rent_amount_gbp: Number(g.rent_amount_gbp) || 0,
      rent_cadence: ((g.rent_cadence as RentCadence) ?? "weekly") as RentCadence,
      settlement_balance_direction: (g.settlement_balance_direction as string | null) ?? null,
      settlement_balance_gbp: Number(g.settlement_balance_gbp ?? 0) || 0,
      rentBillingMode: rentBillingModeFromSettlement(g.termination_settlement),
    }),
  );

  const groupIds = rows.map((g) => g.id as string);
  const scheduleFacts: DashboardScheduleFact[] = [];
  if (groupIds.length) {
    const { data: scheduleRows, error: scheduleErr } = await supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .in("hire_group_id", groupIds);
    if (scheduleErr) return { ok: false, error: scheduleErr.message };

    const rowIds = (scheduleRows ?? []).map((r) => r.id as string);
    let eventState = new Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>();
    if (rowIds.length) {
      const { data: events } = await supabase
        .from("vehicle_hire_payment_status_events")
        .select("schedule_row_id, to_status, amendment_payload, created_at")
        .in("schedule_row_id", rowIds)
        .eq("event_kind", "status_change")
        .order("created_at", { ascending: false });
      eventState = buildPaymentRowEventStateMap(
        (events ?? []).map((event) => ({
          schedule_row_id: event.schedule_row_id as string,
          to_status: (event.to_status as string | null) ?? null,
          amendment_payload: event.amendment_payload,
        })),
      );
    }

    for (const row of scheduleRows ?? []) {
      const discounts = row.vehicle_hire_schedule_discounts as { amount_gbp: number }[] | null;
      const discountTotalGbp = (discounts ?? []).reduce((sum, d) => sum + Number(d.amount_gbp), 0);
      const storedStatus = row.payment_status as HirePaymentStatus;
      const event = eventState.get(row.id as string);
      const paymentStatus = resolveHirePaymentWorkflowStatus(
        storedStatus,
        event?.latestToStatus ?? null,
        { periodStartYmd: row.period_start as string, todayYmd },
      );
      scheduleFacts.push({
        hireGroupId: row.hire_group_id as string,
        vehicleId: id,
        subcompanyId: shell.vehicle.subcompany_id,
        periodStart: (row.period_start as string).slice(0, 10),
        periodEnd: (row.period_end as string).slice(0, 10),
        rowKind: row.row_kind as string,
        paymentStatus,
        approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp,
      });
    }
  }

  const outstandingGbp = vehicleHiresAmountDueGbp({
    hires: hireFacts,
    scheduleRows: scheduleFacts,
    todayYmd,
  });

  let hireIncomeGbp: number | null = null;
  if (canReadMaintenance(profile)) {
    const income = await loadVehicleHireIncomeNetGbp(id);
    if (income.ok) hireIncomeGbp = income.netIncomeGbp;
  }

  const currentId = pickCurrentOpenHireId(
    rows.map((g) => ({
      id: g.id as string,
      status: String(g.status ?? ""),
      updated_at: (g.updated_at as string | null) ?? null,
      created_at: (g.created_at as string | null) ?? null,
    })),
  );

  let currentHire: VehicleHiresCurrentHire | null = null;
  if (currentId) {
    const group = rows.find((g) => g.id === currentId);
    if (group && openStatuses.includes(group.status as (typeof openStatuses)[number])) {
      const agreements = (
        (
          group as {
            vehicle_hire_agreements?: { id: string; end_date: string | null; signed_at: string | null }[];
          }
        ).vehicle_hire_agreements ?? []
      );
      let driverLabel = "Driver";
      const driverUserId = (group.driver_user_id as string | null)?.trim();
      if (driverUserId) {
        try {
          const labels = await loadDriverLabelsMap(createSupabaseAdminClient(), [driverUserId]);
          driverLabel = labels.get(driverUserId) ?? "Driver";
        } catch {
          /* optional */
        }
      }
      const endDates = agreements.map((a) => a.end_date).filter(Boolean) as string[];
      endDates.sort();
      const signedCount = agreements.filter((a) => Boolean(a.signed_at)).length;
      currentHire = {
        hireGroupId: group.id as string,
        status: group.status as HireGroupStatus,
        driverLabel,
        startDate: group.start_date as string,
        endDate: endDates.at(-1) ?? null,
        rentAmountGbp: Number(group.rent_amount_gbp) || 0,
        rentCadence: ((group.rent_cadence as RentCadence) ?? "weekly") as RentCadence,
        depositGbp: group.deposit_gbp != null ? Number(group.deposit_gbp) : null,
        agreementLabel: agreementLabelFor(agreements),
        driverAccessStatus: (group.driver_access_status as string) ?? "not_requested",
        canViewSignedDocuments: agreements.length > 0 && signedCount === agreements.length,
      };
    }
  }

  return {
    ok: true,
    data: {
      currentHire,
      stats: {
        totalHires: countVehicleHires(rows.map((g) => String(g.status ?? ""))),
        hireDays,
        utilisationPercent: hireUtilisationPercent(hireDays, daysSinceAdded),
        hireIncomeGbp,
        outstandingGbp,
      },
      settlementsByGroupId,
      canWrite: canWriteRentals(profile) && shell.access.kind !== "historic",
    },
  };
}
