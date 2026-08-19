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
  hireNeedsLiveBalanceFacts,
  parseHireBalanceSnapshotFromTermination,
  type CompanyBalancesExtraChargeFact,
  type CompanyBalancesHireFact,
  type CompanyBalancesPageData,
  type CompanyBalancesScheduleFact,
  type CompanyBalancesSettlementPaymentFact,
  type CompanyBalancesSubcompanyOption,
  type CompanyBalancesTab,
} from "@/lib/fleet/company-balances-summary";
import { resolveCompanyDashboardPeriod } from "@/lib/fleet/company-dashboard-period";
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

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const BALANCE_HIRE_STATUSES = ["active", "completed", "terminated"] as const;

function chunkIds<T>(ids: T[], size = 100): T[][] {
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

async function loadDriverLabelsChunked(
  admin: AdminClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const ids of chunkIds(userIds, 100)) {
    const chunk = await loadDriverLabelsMap(admin, ids);
    for (const [id, label] of chunk) map.set(id, label);
  }
  return map;
}

type LiveFacts = {
  scheduleFacts: CompanyBalancesScheduleFact[];
  extraChargesByHireId: Map<string, CompanyBalancesExtraChargeFact[]>;
  pendingExtraByHireId: Map<string, number>;
  balancePaymentsByHireId: Map<string, CompanyBalancesSettlementPaymentFact[]>;
};

function emptyLiveFacts(): LiveFacts {
  return {
    scheduleFacts: [],
    extraChargesByHireId: new Map(),
    pendingExtraByHireId: new Map(),
    balancePaymentsByHireId: new Map(),
  };
}

async function loadEventStateForScheduleRows(
  admin: AdminClient,
  scheduleRows: readonly Record<string, unknown>[],
): Promise<{ ok: true; eventState: Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }> } | { ok: false; error: string }> {
  const pendingIds = scheduleRows
    .filter((row) => String(row.payment_status ?? "") === "pending_approval")
    .map((row) => String(row.id));
  const eventState = new Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>();
  if (!pendingIds.length) return { ok: true, eventState };

  for (const eventIds of chunkIds(pendingIds)) {
    const eventsLoaded = await fetchAllRows((from, to) =>
      admin
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
  return { ok: true, eventState };
}

function appendScheduleFacts(input: {
  scheduleRows: readonly Record<string, unknown>[];
  eventState: Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>;
  hireById: Map<string, CompanyBalancesHireFact>;
  todayYmd: string;
  into: CompanyBalancesScheduleFact[];
  seenIds?: Set<string>;
}) {
  for (const row of input.scheduleRows) {
    const scheduleRowId = String(row.id);
    if (input.seenIds?.has(scheduleRowId)) continue;
    const hire = input.hireById.get(String(row.hire_group_id));
    if (!hire) continue;
    const discounts = row.vehicle_hire_schedule_discounts as { amount_gbp: number }[] | null;
    const discountTotalGbp = (discounts ?? []).reduce((sum, d) => sum + Number(d.amount_gbp), 0);
    const storedStatus = row.payment_status as HirePaymentStatus;
    const event = input.eventState.get(scheduleRowId);
    const paymentStatus = resolveHirePaymentWorkflowStatus(
      storedStatus,
      event?.latestToStatus ?? null,
      { periodStartYmd: String(row.period_start), todayYmd: input.todayYmd },
    );
    input.into.push({
      scheduleRowId,
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
    input.seenIds?.add(scheduleRowId);
  }
}

function appendBalancePayments(input: {
  payments: readonly Record<string, unknown>[];
  hireById: Map<string, CompanyBalancesHireFact>;
  into: Map<string, CompanyBalancesSettlementPaymentFact[]>;
  seenIds?: Set<string>;
}) {
  for (const payment of input.payments) {
    const id = String(payment.id);
    if (input.seenIds?.has(id)) continue;
    const hire = input.hireById.get(String(payment.hire_group_id));
    if (!hire) continue;
    const direction = payment.direction as string;
    if (direction !== "received_from_driver" && direction !== "paid_to_driver") continue;
    const mapped: CompanyBalancesSettlementPaymentFact = {
      id,
      hireGroupId: hire.id,
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction,
      paymentCategory: String(payment.payment_category ?? "settlement"),
      paidAt: String(payment.paid_at ?? ""),
      vehicleVrm: hire.vehicleVrm,
      driverLabel: hire.driverLabel,
    };
    const bucket = input.into.get(hire.id) ?? [];
    bucket.push(mapped);
    input.into.set(hire.id, bucket);
    input.seenIds?.add(id);
  }
}

/**
 * Schedule, extras and settlement rows for hires that still have a live balance.
 * Caller must pass hire IDs already scoped to the authorised parent company / subcompanies.
 */
async function loadLiveBalanceFacts(
  admin: AdminClient,
  liveHireIds: string[],
  hireById: Map<string, CompanyBalancesHireFact>,
  todayYmd: string,
): Promise<{ ok: true; facts: LiveFacts } | { ok: false; error: string }> {
  const facts = emptyLiveFacts();
  if (!liveHireIds.length) return { ok: true, facts };

  const chunkResults = await Promise.all(
    chunkIds(liveHireIds).map(async (ids) => {
      const [scheduleLoaded, chargeLoaded, groupEventsLoaded, balanceLoaded] = await Promise.all([
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_payment_schedule")
            .select(
              "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
            )
            .in("hire_group_id", ids)
            .lte("period_start", todayYmd)
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_driver_charge_line_items")
            .select("hire_group_id, amount_gbp, resolution")
            .in("hire_group_id", ids)
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_group_events")
            .select("hire_group_id, event_type, metadata, created_at")
            .in("hire_group_id", ids)
            .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_balance_payments")
            .select("id, hire_group_id, amount_gbp, direction, payment_category, paid_at")
            .in("hire_group_id", ids)
            .order("paid_at", { ascending: false })
            .range(from, to),
        ),
      ]);
      if (!scheduleLoaded.ok) return scheduleLoaded;
      if (!chargeLoaded.ok) return chargeLoaded;
      if (!groupEventsLoaded.ok) return groupEventsLoaded;
      if (!balanceLoaded.ok) return balanceLoaded;

      const eventsLoaded = await loadEventStateForScheduleRows(admin, scheduleLoaded.data);
      if (!eventsLoaded.ok) return eventsLoaded;

      return {
        ok: true as const,
        scheduleRows: scheduleLoaded.data,
        charges: chargeLoaded.data,
        groupEvents: groupEventsLoaded.data,
        payments: balanceLoaded.data,
        eventState: eventsLoaded.eventState,
      };
    }),
  );

  for (const chunk of chunkResults) {
    if (!chunk.ok) return chunk;
    appendScheduleFacts({
      scheduleRows: chunk.scheduleRows,
      eventState: chunk.eventState,
      hireById,
      todayYmd,
      into: facts.scheduleFacts,
    });
    for (const charge of chunk.charges) {
      const hireGroupId = String(charge.hire_group_id);
      const bucket = facts.extraChargesByHireId.get(hireGroupId) ?? [];
      bucket.push({
        amountGbp: Number(charge.amount_gbp ?? 0),
        resolution: String(charge.resolution ?? ""),
      });
      facts.extraChargesByHireId.set(hireGroupId, bucket);
    }
    const eventsByHire = new Map<string, { event_type: string; metadata: unknown; created_at: string }[]>();
    for (const event of chunk.groupEvents) {
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
      if (pending) facts.pendingExtraByHireId.set(hireGroupId, pending.amountGbp);
    }
    appendBalancePayments({
      payments: chunk.payments,
      hireById,
      into: facts.balancePaymentsByHireId,
    });
  }

  return { ok: true, facts };
}

/**
 * Month-window receipts for settled historic hires (excluded from live schedule loads).
 * Hire IDs must already be tenant- and subcompany-scoped.
 */
async function loadSettledMonthActivity(
  admin: AdminClient,
  settledHireIds: string[],
  hireById: Map<string, CompanyBalancesHireFact>,
  todayYmd: string,
  monthStartYmd: string,
  monthEndYmd: string,
  into: LiveFacts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!settledHireIds.length) return { ok: true };
  const seenScheduleIds = new Set(into.scheduleFacts.map((row) => row.scheduleRowId));
  const seenPaymentIds = new Set(
    [...into.balancePaymentsByHireId.values()].flat().map((payment) => payment.id),
  );

  const chunkResults = await Promise.all(
    chunkIds(settledHireIds).map(async (ids) => {
      const [scheduleLoaded, balanceLoaded] = await Promise.all([
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_payment_schedule")
            .select(
              "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
            )
            .in("hire_group_id", ids)
            .gte("period_start", monthStartYmd)
            .lte("period_start", monthEndYmd)
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          admin
            .from("vehicle_hire_balance_payments")
            .select("id, hire_group_id, amount_gbp, direction, payment_category, paid_at")
            .in("hire_group_id", ids)
            .gte("paid_at", `${monthStartYmd}T00:00:00.000+00:00`)
            .lte("paid_at", `${monthEndYmd}T23:59:59.999+00:00`)
            .range(from, to),
        ),
      ]);
      if (!scheduleLoaded.ok) return scheduleLoaded;
      if (!balanceLoaded.ok) return balanceLoaded;
      return { ok: true as const, scheduleRows: scheduleLoaded.data, payments: balanceLoaded.data };
    }),
  );

  for (const chunk of chunkResults) {
    if (!chunk.ok) return chunk;
    appendScheduleFacts({
      scheduleRows: chunk.scheduleRows,
      eventState: new Map(),
      hireById,
      todayYmd,
      into: into.scheduleFacts,
      seenIds: seenScheduleIds,
    });
    appendBalancePayments({
      payments: chunk.payments,
      hireById,
      into: into.balancePaymentsByHireId,
      seenIds: seenPaymentIds,
    });
  }
  return { ok: true };
}

/**
 * Company Balances hub — KPIs and account rows from live schedule, extras and settlement data.
 * Authorisation: authenticated rental staff with rentals.read; queries scoped to parent company
 * and accessible subcompanies. Service-role reads run only after those checks, and only for
 * hire IDs already loaded under that scope (RLS exists-joins on schedule/events are too slow
 * for this list).
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
  const admin = createSupabaseAdminClient();
  const accessible = await loadUserAccessibleSubcompanyIds(profile);

  if (accessible !== "all" && !accessible.length) {
    return { ok: true, data: emptyBalancesPage(todayYmd) };
  }

  let subcompanyQuery = supabase
    .from("subcompanies")
    .select("id, name, display_name")
    .eq("parent_company_id", parentCompanyId)
    .order("name", { ascending: true });
  if (accessible !== "all") {
    subcompanyQuery = subcompanyQuery.in("id", accessible);
  }

  const [hireLoaded, subcompanyRes] = await Promise.all([
    fetchAllRows((from, to) => {
      let hireQuery = admin
        .from("vehicle_hire_groups")
        .select(
          "id, subcompany_id, status, start_date, activated_at, ended_at, terminated_at, rent_cadence, settlement_balance_direction, settlement_balance_gbp, termination_settlement, driver_user_id, driver_email, driver_licence_number, vehicles(vrm, make, model), subcompanies(name, display_name)",
        )
        .eq("parent_company_id", parentCompanyId)
        .in("status", [...BALANCE_HIRE_STATUSES])
        .range(from, to);
      if (accessible !== "all") {
        hireQuery = hireQuery.in("subcompany_id", accessible);
      }
      return hireQuery;
    }),
    subcompanyQuery,
  ]);
  if (!hireLoaded.ok) return hireLoaded;

  const { data: subcompanyRows, error: subErr } = subcompanyRes;
  if (subErr) return { ok: false, error: "Could not load balances." };

  const subcompanies: CompanyBalancesSubcompanyOption[] = (subcompanyRows ?? []).map((row) => ({
    id: row.id as string,
    name: mapSubcompanyName(row) ?? "Subcompany",
  }));

  const driverUserIds = hireLoaded.data
    .map((row) => row.driver_user_id as string | null)
    .filter(Boolean) as string[];

  const period = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd });
  if ("error" in period) {
    return { ok: false, error: "Could not load balances." };
  }

  const driverUserIdByHireId = new Map<string, string>();
  const hires: CompanyBalancesHireFact[] = hireLoaded.data.map((h) => {
    const terminationSettlement = h.termination_settlement ?? null;
    const billingModeRaw =
      terminationSettlement && typeof terminationSettlement === "object"
        ? (terminationSettlement as { rentBillingMode?: string }).rentBillingMode
        : null;
    const billingMode =
      billingModeRaw === "actual" || billingModeRaw === "end_of_period"
        ? (billingModeRaw as HireTerminationRentBillingMode)
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
    const snapshot = parseHireBalanceSnapshotFromTermination(terminationSettlement);
    if (driverUserId) driverUserIdByHireId.set(h.id as string, driverUserId);

    return {
      id: h.id as string,
      status: String(h.status ?? ""),
      subcompanyId: (h.subcompany_id as string | null) ?? null,
      subcompanyName: mapSubcompanyName(subcompany),
      vehicleVrm: vehicle.vrm ?? mapVehicleVrm(h.vehicles as { vrm?: string | null } | null),
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      driverLabel: fallbackDriver,
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
      snapshotChargesGbp: snapshot.chargesGbp,
      snapshotReceivedGbp: snapshot.receivedGbp,
    };
  });

  const hireById = new Map(hires.map((h) => [h.id, h]));
  const liveHireIds = hires.filter(hireNeedsLiveBalanceFacts).map((h) => h.id);
  const settledHireIds = hires
    .filter((h) => !hireNeedsLiveBalanceFacts(h) && (h.status === "completed" || h.status === "terminated"))
    .map((h) => h.id);

  const monthFacts = emptyLiveFacts();
  const [driverLabels, liveLoaded, monthLoaded] = await Promise.all([
    driverUserIds.length > 0
      ? loadDriverLabelsChunked(admin, driverUserIds)
      : Promise.resolve(new Map<string, string>()),
    loadLiveBalanceFacts(admin, liveHireIds, hireById, todayYmd),
    loadSettledMonthActivity(
      admin,
      settledHireIds,
      hireById,
      todayYmd,
      period.startYmd,
      period.endYmd,
      monthFacts,
    ),
  ]);
  if (!liveLoaded.ok) return liveLoaded;
  if (!monthLoaded.ok) return monthLoaded;

  for (const hire of hires) {
    const userId = driverUserIdByHireId.get(hire.id);
    if (!userId) continue;
    hire.driverLabel = driverLabels.get(userId) ?? hire.driverLabel;
  }

  const facts = liveLoaded.facts;
  const seenScheduleIds = new Set(facts.scheduleFacts.map((row) => row.scheduleRowId));
  for (const row of monthFacts.scheduleFacts) {
    if (seenScheduleIds.has(row.scheduleRowId)) continue;
    facts.scheduleFacts.push(row);
  }
  const seenPaymentIds = new Set(
    [...facts.balancePaymentsByHireId.values()].flat().map((payment) => payment.id),
  );
  for (const [hireId, payments] of monthFacts.balancePaymentsByHireId) {
    const bucket = facts.balancePaymentsByHireId.get(hireId) ?? [];
    for (const payment of payments) {
      if (seenPaymentIds.has(payment.id)) continue;
      bucket.push(payment);
    }
    facts.balancePaymentsByHireId.set(hireId, bucket);
  }
  for (const payments of facts.balancePaymentsByHireId.values()) {
    for (const payment of payments) {
      payment.driverLabel = hireById.get(payment.hireGroupId)?.driverLabel ?? payment.driverLabel;
    }
  }

  return {
    ok: true,
    data: buildCompanyBalancesPage({
      hires,
      scheduleRows: facts.scheduleFacts,
      extraChargesByHireId: facts.extraChargesByHireId,
      balancePaymentsByHireId: facts.balancePaymentsByHireId,
      pendingExtraByHireId: facts.pendingExtraByHireId,
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
