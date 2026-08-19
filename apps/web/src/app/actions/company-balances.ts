"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import {
  buildCompanyBalancesExportCsv,
  buildCompanyBalancesPage,
  companyBalancesAccountsForTab,
  companyBalancesExportFileName,
  type CompanyBalancesExtraChargeFact,
  type CompanyBalancesHireFact,
  type CompanyBalancesPageData,
  type CompanyBalancesScheduleFact,
  type CompanyBalancesSettlementPaymentFact,
  type CompanyBalancesSubcompanyOption,
  type CompanyBalancesTab,
} from "@/lib/fleet/company-balances-summary";
import {
  buildPaymentRowEventStateMap,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import {
  EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
  resolveOpenExtraChargePayment,
} from "@/lib/fleet/hire-driver-charge-payment";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

function mapSubcompanyName(
  subcompany: { name?: string | null; display_name?: string | null } | null,
): string | null {
  if (!subcompany) return null;
  return subcompany.display_name?.trim() || subcompany.name?.trim() || null;
}

function mapVehicleVrm(
  vehicles: { vrm?: string | null } | { vrm?: string | null }[] | null,
): string | null {
  const nested = Array.isArray(vehicles) ? vehicles[0] : vehicles;
  return nested?.vrm?.trim() || null;
}

function mapVehicleFields(
  vehicles: { vrm?: string | null; make?: string | null; model?: string | null } | null,
): { vrm: string | null; make: string | null; model: string | null } {
  if (!vehicles) return { vrm: null, make: null, model: null };
  return {
    vrm: vehicles.vrm?.trim() || null,
    make: vehicles.make?.trim() || null,
    model: vehicles.model?.trim() || null,
  };
}

function emptyBalancesPage(todayYmd: string, subcompanies: CompanyBalancesSubcompanyOption[] = []) {
  return buildCompanyBalancesPage({
    hires: [],
    scheduleRows: [],
    extraChargesByHireId: new Map(),
    balancePaymentsByHireId: new Map(),
    pendingExtraByHireId: new Map(),
    subcompanies,
    todayYmd,
  });
}

async function fetchAllRows(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> {
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) return { ok: false, error: "Could not load balances." };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { ok: true, data: all };
}

/**
 * Company Balances hub — KPIs and account rows from live schedule, extras and settlement data.
 * Authorisation: authenticated rental staff with rentals.read; queries scoped to parent company
 * and accessible subcompanies.
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

  let subcompanyQuery = supabase
    .from("subcompanies")
    .select("id, name, display_name")
    .eq("parent_company_id", parentCompanyId)
    .order("name", { ascending: true });
  if (accessible !== "all") {
    if (!accessible.length) {
      return { ok: true, data: emptyBalancesPage(todayYmd) };
    }
    subcompanyQuery = subcompanyQuery.in("id", accessible);
  }
  const { data: subcompanyRows, error: subErr } = await subcompanyQuery;
  if (subErr) return { ok: false, error: "Could not load balances." };

  const subcompanies: CompanyBalancesSubcompanyOption[] = (subcompanyRows ?? []).map((row) => ({
    id: row.id as string,
    name: mapSubcompanyName(row) ?? "Subcompany",
  }));

  let hireQuery = supabase
    .from("vehicle_hire_groups")
    .select(
      "id, subcompany_id, status, start_date, activated_at, ended_at, terminated_at, rent_cadence, settlement_balance_direction, settlement_balance_gbp, termination_settlement, driver_user_id, driver_email, driver_licence_number, vehicles(vrm, make, model), subcompanies(name, display_name)",
    )
    .eq("parent_company_id", parentCompanyId)
    .neq("status", "cancelled");

  if (accessible !== "all") {
    if (!accessible.length) {
      return { ok: true, data: emptyBalancesPage(todayYmd, subcompanies) };
    }
    hireQuery = hireQuery.in("subcompany_id", accessible);
  }

  const { data: hireRows, error: hireErr } = await hireQuery;
  if (hireErr) return { ok: false, error: "Could not load balances." };

  const driverUserIds = (hireRows ?? [])
    .map((row) => row.driver_user_id as string | null)
    .filter(Boolean) as string[];
  const driverLabels =
    driverUserIds.length > 0
      ? await loadDriverLabelsMap(createSupabaseAdminClient(), driverUserIds)
      : new Map<string, string>();

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
    const vehicle = mapVehicleFields(
      (Array.isArray(h.vehicles) ? h.vehicles[0] : h.vehicles) as {
        vrm?: string | null;
        make?: string | null;
        model?: string | null;
      } | null,
    );
    const subcompany = (Array.isArray(h.subcompanies) ? h.subcompanies[0] : h.subcompanies) as {
      name?: string | null;
      display_name?: string | null;
    } | null;
    const driverUserId = (h.driver_user_id as string | null) ?? null;
    const fallbackDriver =
      (h.driver_email as string | null)?.trim() ||
      (h.driver_licence_number as string | null)?.trim() ||
      null;

    return {
      id: h.id as string,
      status: String(h.status ?? ""),
      subcompanyId: (h.subcompany_id as string | null) ?? null,
      subcompanyName: mapSubcompanyName(subcompany),
      vehicleVrm: vehicle.vrm ?? mapVehicleVrm(h.vehicles as { vrm?: string | null } | null),
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      driverLabel: (driverUserId ? driverLabels.get(driverUserId) : null) ?? fallbackDriver,
      startDateYmd: (h.start_date as string | null)?.slice(0, 10) ?? null,
      activatedAtYmd: (h.activated_at as string | null)?.slice(0, 10) ?? null,
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
  const balancePaymentsByHireId = new Map<string, CompanyBalancesSettlementPaymentFact[]>();
  const extraChargesByHireId = new Map<string, CompanyBalancesExtraChargeFact[]>();
  const pendingExtraByHireId = new Map<string, number>();

  for (const ids of chunkIds(hireIds)) {
    const scheduleLoaded = await fetchAllRows((from, to) =>
      supabase
        .from("vehicle_hire_payment_schedule")
        .select(
          "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
        )
        .in("hire_group_id", ids)
        .range(from, to),
    );
    if (!scheduleLoaded.ok) return scheduleLoaded;
    const scheduleRows = scheduleLoaded.data;

    const rowIds = scheduleRows.map((r) => String(r.id));
    const eventState = new Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>();
    for (const eventIds of chunkIds(rowIds)) {
      const eventsLoaded = await fetchAllRows((from, to) =>
        supabase
          .from("vehicle_hire_payment_status_events")
          .select("schedule_row_id, to_status, amendment_payload, created_at")
          .in("schedule_row_id", eventIds)
          .eq("event_kind", "status_change")
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (!eventsLoaded.ok) return eventsLoaded;
      const chunkState = buildPaymentRowEventStateMap(
        eventsLoaded.data.map((event) => ({
          schedule_row_id: String(event.schedule_row_id),
          to_status: (event.to_status as string | null) ?? null,
          amendment_payload: event.amendment_payload,
        })),
      );
      for (const [key, value] of chunkState) eventState.set(key, value);
    }

    for (const row of scheduleRows) {
      const hire = hireById.get(String(row.hire_group_id));
      if (!hire) continue;
      const discounts = row.vehicle_hire_schedule_discounts as { amount_gbp: number }[] | null;
      const discountTotalGbp = (discounts ?? []).reduce((sum, d) => sum + Number(d.amount_gbp), 0);
      const storedStatus = row.payment_status as HirePaymentStatus;
      const event = eventState.get(String(row.id));
      const paymentStatus = resolveHirePaymentWorkflowStatus(
        storedStatus,
        event?.latestToStatus ?? null,
        { periodStartYmd: String(row.period_start), todayYmd },
      );
      scheduleFacts.push({
        scheduleRowId: String(row.id),
        hireGroupId: hire.id,
        vehicleId: "",
        subcompanyId: hire.subcompanyId ?? "",
        periodStart: String(row.period_start).slice(0, 10),
        periodEnd: String(row.period_end).slice(0, 10),
        rowKind: String(row.row_kind),
        paymentStatus,
        approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp,
        pendingSubmittedGbp:
          paymentStatus === "pending_approval" ? (event?.pendingSubmittedGbp ?? null) : null,
      });
    }

    const chargeLoaded = await fetchAllRows((from, to) =>
      supabase
        .from("vehicle_hire_driver_charge_line_items")
        .select("hire_group_id, amount_gbp, resolution")
        .in("hire_group_id", ids)
        .range(from, to),
    );
    if (!chargeLoaded.ok) return chargeLoaded;
    for (const charge of chargeLoaded.data) {
      const hireGroupId = String(charge.hire_group_id);
      const bucket = extraChargesByHireId.get(hireGroupId) ?? [];
      bucket.push({
        amountGbp: Number(charge.amount_gbp ?? 0),
        resolution: String(charge.resolution ?? ""),
      });
      extraChargesByHireId.set(hireGroupId, bucket);
    }

    const groupEventsLoaded = await fetchAllRows((from, to) =>
      supabase
        .from("vehicle_hire_group_events")
        .select("hire_group_id, event_type, metadata, created_at")
        .in("hire_group_id", ids)
        .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
        .range(from, to),
    );
    if (!groupEventsLoaded.ok) return groupEventsLoaded;

    const eventsByHire = new Map<string, { event_type: string; metadata: unknown; created_at: string }[]>();
    for (const event of groupEventsLoaded.data) {
      const hireGroupId = String(event.hire_group_id);
      const bucket = eventsByHire.get(hireGroupId) ?? [];
      bucket.push({
        event_type: String(event.event_type),
        metadata: event.metadata,
        created_at: String(event.created_at),
      });
      eventsByHire.set(hireGroupId, bucket);
    }
    for (const [hireGroupId, events] of eventsByHire) {
      const pending = resolveOpenExtraChargePayment(
        events.map((event) => ({
          eventType: event.event_type,
          createdAt: event.created_at,
          metadata: (event.metadata as Record<string, unknown> | null) ?? null,
        })),
      );
      if (pending) pendingExtraByHireId.set(hireGroupId, pending.amountGbp);
    }

    const balanceLoaded = await fetchAllRows((from, to) =>
      supabase
        .from("vehicle_hire_balance_payments")
        .select("id, hire_group_id, amount_gbp, direction, payment_category, paid_at")
        .in("hire_group_id", ids)
        .order("paid_at", { ascending: false })
        .range(from, to),
    );
    if (!balanceLoaded.ok) return balanceLoaded;

    for (const payment of balanceLoaded.data) {
      const hire = hireById.get(String(payment.hire_group_id));
      if (!hire) continue;
      const direction = payment.direction as string;
      if (direction !== "received_from_driver" && direction !== "paid_to_driver") continue;
      const mapped: CompanyBalancesSettlementPaymentFact = {
        id: String(payment.id),
        hireGroupId: hire.id,
        amountGbp: Number(payment.amount_gbp ?? 0),
        direction,
        paymentCategory: String(payment.payment_category ?? "settlement"),
        paidAt: String(payment.paid_at ?? ""),
        vehicleVrm: hire.vehicleVrm,
        driverLabel: hire.driverLabel,
      };
      const bucket = balancePaymentsByHireId.get(hire.id) ?? [];
      bucket.push(mapped);
      balancePaymentsByHireId.set(hire.id, bucket);
    }
  }

  return {
    ok: true,
    data: buildCompanyBalancesPage({
      hires,
      scheduleRows: scheduleFacts,
      extraChargesByHireId,
      balancePaymentsByHireId,
      pendingExtraByHireId,
      subcompanies,
      todayYmd,
    }),
  };
}

export async function exportCompanyBalancesAction(
  tab: CompanyBalancesTab = "active",
  search = "",
  subcompanyId: string | null = null,
): Promise<ExportResult> {
  const loaded = await loadCompanyBalancesPageAction();
  if (!loaded.ok) return loaded;
  const tabRows = companyBalancesAccountsForTab(loaded.data.accountRows, tab);
  const rows =
    search.trim() || subcompanyId
      ? tabRows.filter((row) => {
          const query = search.trim().toLowerCase();
          if (subcompanyId && row.subcompanyId !== subcompanyId) return false;
          if (!query) return true;
          const haystack = [row.vehicleVrm, row.vehicleLabel, row.driverLabel, row.subcompanyName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : tabRows;
  return {
    ok: true,
    csv: buildCompanyBalancesExportCsv(loaded.data, tab, rows),
    fileName: companyBalancesExportFileName(),
  };
}
