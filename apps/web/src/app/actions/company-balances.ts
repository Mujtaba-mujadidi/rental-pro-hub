"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  buildCompanyBalancesExportCsv,
  buildCompanyBalancesPage,
  companyBalancesExportFileName,
  type CompanyBalancesHireFact,
  type CompanyBalancesPageData,
  type CompanyBalancesScheduleFact,
  type CompanyBalancesSettlementPaymentFact,
  type CompanyBalancesTab,
} from "@/lib/fleet/company-balances-summary";
import {
  buildPaymentRowEventStateMap,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { createClient } from "@/lib/supabase/server";

type LoadResult =
  | { ok: true; data: CompanyBalancesPageData }
  | { ok: false; error: string };

type ExportResult =
  | { ok: true; csv: string; fileName: string }
  | { ok: false; error: string };

function chunkIds<T>(ids: T[], size = 200): T[][] {
  if (!ids.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function mapDriverLabel(group: {
  driver_email?: string | null;
  driver_licence_number?: string | null;
}): string | null {
  return group.driver_email?.trim() || group.driver_licence_number?.trim() || null;
}

function mapVehicleVrm(
  vehicles: { vrm?: string | null } | { vrm?: string | null }[] | null,
): string | null {
  const nested = Array.isArray(vehicles) ? vehicles[0] : vehicles;
  return nested?.vrm?.trim() || null;
}

/**
 * Company Balances hub — KPIs and rows from live schedule + settlement data.
 * Authorisation: authenticated rental staff with rentals.read; queries scoped to parent company
 * and accessible subcompanies. Totals are computed only via buildCompanyBalancesPage (shared with UI tests).
 */
export async function loadCompanyBalancesPageAction(): Promise<LoadResult> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) {
    return { ok: false, error: "You do not have permission." };
  }
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const todayYmd = ukTodayYmd();
  const supabase = await createClient();
  const accessible = await loadUserAccessibleSubcompanyIds(profile);

  let hireQuery = supabase
    .from("vehicle_hire_groups")
    .select(
      "id, subcompany_id, status, ended_at, terminated_at, rent_cadence, settlement_balance_direction, settlement_balance_gbp, termination_settlement, driver_email, driver_licence_number, vehicles(vrm)",
    )
    .eq("parent_company_id", parentCompanyId)
    .neq("status", "cancelled");

  if (accessible !== "all") {
    if (!accessible.length) {
      return {
        ok: true,
        data: buildCompanyBalancesPage({
          hires: [],
          scheduleRows: [],
          settlementPayments: [],
          todayYmd,
        }),
      };
    }
    hireQuery = hireQuery.in("subcompany_id", accessible);
  }

  const { data: hireRows, error: hireErr } = await hireQuery;
  if (hireErr) return { ok: false, error: hireErr.message };

  const hires: CompanyBalancesHireFact[] = (hireRows ?? []).map((h) => {
    const terminationSettlement = (h.termination_settlement ?? null) as {
      rentBillingMode?: string;
    } | null;
    const billingMode =
      terminationSettlement?.rentBillingMode === "actual" ||
      terminationSettlement?.rentBillingMode === "end_of_period"
        ? (terminationSettlement.rentBillingMode as HireTerminationRentBillingMode)
        : null;
    const settlementDirection = (h.settlement_balance_direction as string | null) ?? null;
    return {
      id: h.id as string,
      status: String(h.status ?? ""),
      vehicleVrm: mapVehicleVrm(h.vehicles as { vrm?: string | null } | { vrm?: string | null }[] | null),
      driverLabel: mapDriverLabel({
        driver_email: (h.driver_email as string | null) ?? null,
        driver_licence_number: (h.driver_licence_number as string | null) ?? null,
      }),
      endedAtYmd: (h.ended_at as string | null)?.slice(0, 10) ?? null,
      terminatedAtYmd: (h.terminated_at as string | null)?.slice(0, 10) ?? null,
      rentCadence: ((h.rent_cadence as RentCadence) ?? "weekly") as RentCadence,
      rentBillingMode: billingMode,
      settlementBalanceDirection:
        settlementDirection === "driver_owes_company" ||
        settlementDirection === "company_owes_driver" ||
        settlementDirection === "settled"
          ? settlementDirection
          : null,
      settlementOpenBalanceGbp: Number(h.settlement_balance_gbp ?? 0),
    };
  });

  const hireById = new Map(hires.map((h) => [h.id, h]));
  const hireIds = hires.map((h) => h.id);
  const scheduleFacts: CompanyBalancesScheduleFact[] = [];
  const settlementPayments: CompanyBalancesSettlementPaymentFact[] = [];

  for (const ids of chunkIds(hireIds)) {
    const { data: scheduleRows, error: sErr } = await supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .in("hire_group_id", ids);
    if (sErr) return { ok: false, error: sErr.message };

    const rowIds = (scheduleRows ?? []).map((r) => r.id as string);
    const eventState = new Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>();
    for (const eventIds of chunkIds(rowIds)) {
      const { data: events } = await supabase
        .from("vehicle_hire_payment_status_events")
        .select("schedule_row_id, to_status, amendment_payload, created_at")
        .in("schedule_row_id", eventIds)
        .eq("event_kind", "status_change")
        .order("created_at", { ascending: false });
      const chunkState = buildPaymentRowEventStateMap(
        (events ?? []).map((event) => ({
          schedule_row_id: event.schedule_row_id as string,
          to_status: (event.to_status as string | null) ?? null,
          amendment_payload: event.amendment_payload,
        })),
      );
      for (const [key, value] of chunkState) eventState.set(key, value);
    }

    for (const row of scheduleRows ?? []) {
      const hire = hireById.get(row.hire_group_id as string);
      if (!hire) continue;
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
        scheduleRowId: row.id as string,
        hireGroupId: hire.id,
        vehicleId: "",
        subcompanyId: "",
        periodStart: (row.period_start as string).slice(0, 10),
        periodEnd: (row.period_end as string).slice(0, 10),
        rowKind: row.row_kind as string,
        paymentStatus,
        approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp,
        pendingSubmittedGbp:
          paymentStatus === "pending_approval" ? (event?.pendingSubmittedGbp ?? null) : null,
      });
    }

    const { data: balancePayments, error: bpErr } = await supabase
      .from("vehicle_hire_balance_payments")
      .select("id, hire_group_id, amount_gbp, direction, payment_category, paid_at")
      .in("hire_group_id", ids)
      .order("paid_at", { ascending: false })
      .limit(500);
    if (bpErr) return { ok: false, error: bpErr.message };

    for (const payment of balancePayments ?? []) {
      const hire = hireById.get(payment.hire_group_id as string);
      if (!hire) continue;
      const direction = payment.direction as string;
      if (direction !== "received_from_driver" && direction !== "paid_to_driver") continue;
      settlementPayments.push({
        id: payment.id as string,
        hireGroupId: hire.id,
        amountGbp: Number(payment.amount_gbp ?? 0),
        direction,
        paymentCategory: String(payment.payment_category ?? "settlement"),
        paidAt: (payment.paid_at as string) ?? "",
        vehicleVrm: hire.vehicleVrm,
        driverLabel: hire.driverLabel,
      });
    }
  }

  return {
    ok: true,
    data: buildCompanyBalancesPage({
      hires,
      scheduleRows: scheduleFacts,
      settlementPayments,
      todayYmd,
    }),
  };
}

export async function exportCompanyBalancesAction(
  tab: CompanyBalancesTab = "open",
): Promise<ExportResult> {
  const loaded = await loadCompanyBalancesPageAction();
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    csv: buildCompanyBalancesExportCsv(loaded.data, tab),
    fileName: companyBalancesExportFileName(),
  };
}
