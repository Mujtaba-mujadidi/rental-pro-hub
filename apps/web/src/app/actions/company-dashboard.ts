"use server";

import { requireRentalCompanyArea } from "@/lib/auth/profile";
import {
  canManageFleet,
  canManageFleetTracking,
  canReadMaintenance,
  canReadRentals,
  canWriteRentals,
} from "@/lib/auth/rental-permissions";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { getRentalSessionLifecycleCached } from "@/lib/auth/rental-lifecycle";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  buildCompanyDashboardExportCsv,
  buildCompanyDashboardPayload,
  companyDashboardExportFileName,
  dashboardActivityTitleForHireEvent,
  type CompanyDashboardPayload,
  type DashboardActivityFact,
  type DashboardHireFact,
  type DashboardMaintenanceFact,
  type DashboardScheduleFact,
  type DashboardVehicleFact,
} from "@/lib/fleet/company-dashboard-display";
import {
  COMPANY_DASHBOARD_ALL_SUBCOMPANIES,
  resolveCompanyDashboardPeriod,
} from "@/lib/fleet/company-dashboard-period";
import {
  buildPaymentRowEventStateMap,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import {
  deriveHireInsuranceDocumentStatus,
  isHireInsuranceProvidedBy,
} from "@/lib/fleet/hire-insurance";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import type { VehicleStatus } from "@/lib/fleet/vehicles";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { createClient } from "@/lib/supabase/server";

export type CompanyDashboardQuery = {
  subcompanyId?: string | null;
  periodKind?: string | null;
  customStartYmd?: string | null;
  customEndYmd?: string | null;
};

type LoadResult =
  | { ok: true; data: CompanyDashboardPayload }
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

async function loadNotifySettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
) {
  const { data } = await supabase
    .from("companies")
    .select(
      "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
    )
    .eq("id", parentCompanyId)
    .maybeSingle();
  return parseCompanyNotificationSettings(data ?? undefined);
}

function mapInsuranceStatus(input: {
  providedBy: string | null;
  hasDocument: boolean;
  expiryDate: string | null;
  notifyDaysBefore: number;
  todayYmd: string;
  hireStatus: string;
}): DashboardHireFact["insuranceStatus"] {
  if (!["pending_signature", "reserved", "active", "terminated"].includes(input.hireStatus)) {
    return "none";
  }
  const providedBy =
    input.providedBy && isHireInsuranceProvidedBy(input.providedBy) ? input.providedBy : null;
  const status = deriveHireInsuranceDocumentStatus({
    providedBy,
    hasDocument: input.hasDocument,
    expiryDate: input.expiryDate,
    notifyDaysBefore: input.notifyDaysBefore,
    todayYmd: input.todayYmd,
  });
  if (status === "awaiting_upload") return "awaiting";
  if (status === "expiring") return "expiring";
  if (status === "expired") return "expired";
  if (status === "on_file") return "ok";
  return "none";
}

async function buildDashboardPayload(query: CompanyDashboardQuery): Promise<LoadResult> {
  const { user, profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile) || !canReadMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to view the company dashboard." };
  }

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const todayYmd = ukTodayYmd();
  const period = resolveCompanyDashboardPeriod({
    kind: query.periodKind?.trim() || "this_month",
    todayYmd,
    customStartYmd: query.customStartYmd,
    customEndYmd: query.customEndYmd,
  });
  if ("error" in period) return { ok: false, error: period.error };

  const requestedSub =
    query.subcompanyId?.trim() && query.subcompanyId.trim() !== COMPANY_DASHBOARD_ALL_SUBCOMPANIES
      ? query.subcompanyId.trim()
      : null;

  const supabase = await createClient();
  const [accessible, life, notifySettings] = await Promise.all([
    loadUserAccessibleSubcompanyIds(profile),
    getRentalSessionLifecycleCached(user.id, user.email),
    loadNotifySettings(supabase, parentCompanyId),
  ]);

  if (requestedSub) {
    if (accessible !== "all" && !accessible.includes(requestedSub)) {
      return { ok: false, error: "You do not have access to that subcompany." };
    }
  }

  let subsQuery = supabase
    .from("subcompanies")
    .select("id, name, is_primary")
    .eq("parent_company_id", parentCompanyId)
    .order("name", { ascending: true });
  if (accessible !== "all") {
    if (!accessible.length) {
      return {
        ok: true,
        data: buildCompanyDashboardPayload({
          companyName: life.kind === "rental" ? life.companyName ?? "Your company" : "Your company",
          period,
          todayYmd,
          selectedSubcompanyId: null,
          subcompanies: [],
          vehicles: [],
          hires: [],
          scheduleRows: [],
          maintenance: [],
          activity: [],
          notifySettings,
          canWriteRentals: canWriteRentals(profile),
          canManageFleet: canManageFleet(profile),
          canManageFleetTracking: canManageFleetTracking(profile),
        }),
      };
    }
    subsQuery = subsQuery.in("id", accessible);
  }

  const { data: subRows, error: subErr } = await subsQuery;
  if (subErr) return { ok: false, error: subErr.message };

  const subcompanies = (subRows ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.name as string | null) ?? "").trim() || "Unnamed subcompany",
    isPrimary: Boolean(row.is_primary),
  }));

  if (requestedSub && !subcompanies.some((s) => s.id === requestedSub)) {
    return { ok: false, error: "Subcompany not found." };
  }

  const accessibleIds = subcompanies.map((s) => s.id);

  let vehicleQuery = supabase
    .from("vehicles")
    .select(
      "id, vrm, make, model, status, subcompany_id, mot_expiry, tax_expiry, phv_licence_expiry, gps_primary_imei, subcompanies(name)",
    )
    .eq("parent_company_id", parentCompanyId)
    .is("archived_at", null)
    .order("vrm", { ascending: true });
  if (accessible !== "all") vehicleQuery = vehicleQuery.in("subcompany_id", accessibleIds);

  let hireQuery = supabase
    .from("vehicle_hire_groups")
    .select(
      "id, vehicle_id, subcompany_id, status, start_date, activated_at, ended_at, terminated_at, rent_amount_gbp, rent_cadence, insurance_provided_by, settlement_balance_direction, settlement_balance_gbp, termination_settlement",
    )
    .eq("parent_company_id", parentCompanyId)
    .neq("status", "cancelled");
  if (accessible !== "all") hireQuery = hireQuery.in("subcompany_id", accessibleIds);

  const [{ data: vehicleRows, error: vErr }, { data: hireRows, error: hErr }] = await Promise.all([
    vehicleQuery,
    hireQuery,
  ]);
  if (vErr) return { ok: false, error: vErr.message };
  if (hErr) return { ok: false, error: hErr.message };

  const vehicleIds = (vehicleRows ?? []).map((v) => v.id as string);
  const hireIds = (hireRows ?? []).map((h) => h.id as string);

  const docTypesByVehicle = new Map<string, string[]>();
  const purchaseByVehicle = new Map<string, number>();
  const unsignedByHire = new Map<string, number>();
  const insuranceByHire = new Map<string, { expiryDate: string; filePath: string | null }>();
  const scheduleFacts: DashboardScheduleFact[] = [];
  const maintenanceFacts: DashboardMaintenanceFact[] = [];
  const activityFacts: DashboardActivityFact[] = [];

  for (const ids of chunkIds(vehicleIds)) {
    const [{ data: docs }, { data: purchases }] = await Promise.all([
      supabase
        .from("vehicle_documents")
        .select("vehicle_id, doc_type")
        .eq("parent_company_id", parentCompanyId)
        .eq("version_status", "current")
        .in("vehicle_id", ids),
      supabase
        .from("vehicle_ownership_events")
        .select("vehicle_id, amount_gbp")
        .eq("parent_company_id", parentCompanyId)
        .eq("event_type", "purchase")
        .in("vehicle_id", ids),
    ]);
    for (const row of docs ?? []) {
      const list = docTypesByVehicle.get(row.vehicle_id as string) ?? [];
      list.push(row.doc_type as string);
      docTypesByVehicle.set(row.vehicle_id as string, list);
    }
    for (const row of purchases ?? []) {
      const amount =
        typeof row.amount_gbp === "string" ? Number.parseFloat(row.amount_gbp) : Number(row.amount_gbp);
      if (Number.isFinite(amount)) purchaseByVehicle.set(row.vehicle_id as string, amount);
    }
  }

  for (const ids of chunkIds(hireIds)) {
    const [{ data: agreements }, { data: insuranceRows }] = await Promise.all([
      supabase
        .from("vehicle_hire_agreements")
        .select("hire_group_id, signed_at, status")
        .in("hire_group_id", ids),
      supabase
        .from("vehicle_hire_insurance")
        .select("hire_group_id, expiry_date, file_path")
        .eq("parent_company_id", parentCompanyId)
        .in("hire_group_id", ids),
    ]);
    for (const row of agreements ?? []) {
      const hireId = row.hire_group_id as string;
      const status = String(row.status ?? "");
      const signed = Boolean(row.signed_at);
      if (!signed && status === "pending_signature") {
        unsignedByHire.set(hireId, (unsignedByHire.get(hireId) ?? 0) + 1);
      }
    }
    for (const row of insuranceRows ?? []) {
      insuranceByHire.set(row.hire_group_id as string, {
        expiryDate: (row.expiry_date as string).slice(0, 10),
        filePath: (row.file_path as string | null) ?? null,
      });
    }
  }

  const vehicleById = new Map(
    (vehicleRows ?? []).map((v) => {
      const nested = v.subcompanies as { name: string | null } | { name: string | null }[] | null;
      const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
      return [
        v.id as string,
        {
          id: v.id as string,
          vrm: (v.vrm as string) ?? "",
          make: (v.make as string) ?? "",
          model: (v.model as string) ?? "",
          status: v.status as VehicleStatus,
          subcompanyId: v.subcompany_id as string,
          subcompanyName: (subName ?? "").trim() || "Subcompany",
          motExpiry: (v.mot_expiry as string | null) ?? null,
          taxExpiry: (v.tax_expiry as string | null) ?? null,
          phvLicenceExpiry: (v.phv_licence_expiry as string | null) ?? null,
          gpsPrimaryImei: (v.gps_primary_imei as string | null) ?? null,
          presentDocTypes: docTypesByVehicle.get(v.id as string) ?? [],
          purchaseGbp: purchaseByVehicle.get(v.id as string) ?? null,
        } satisfies DashboardVehicleFact,
      ];
    }),
  );

  const hireFacts: DashboardHireFact[] = (hireRows ?? []).map((h) => {
    const insurance = insuranceByHire.get(h.id as string);
    const terminationSettlement = (h.termination_settlement ?? null) as {
      rentBillingMode?: string;
    } | null;
    const billingMode =
      terminationSettlement?.rentBillingMode === "actual" ||
      terminationSettlement?.rentBillingMode === "end_of_period"
        ? terminationSettlement.rentBillingMode
        : null;
    const settlementDirection = (h.settlement_balance_direction as string | null) ?? null;
    return {
      id: h.id as string,
      vehicleId: h.vehicle_id as string,
      subcompanyId: h.subcompany_id as string,
      status: String(h.status ?? ""),
      startDateYmd: (h.start_date as string | null)?.slice(0, 10) ?? null,
      activatedAtYmd: (h.activated_at as string | null)?.slice(0, 10) ?? null,
      endedAtYmd: (h.ended_at as string | null)?.slice(0, 10) ?? null,
      terminatedAtYmd: (h.terminated_at as string | null)?.slice(0, 10) ?? null,
      rentAmountGbp: Number(h.rent_amount_gbp ?? 0),
      rentCadence: ((h.rent_cadence as RentCadence) ?? "weekly") as RentCadence,
      unsignedAgreementCount: unsignedByHire.get(h.id as string) ?? 0,
      insuranceStatus: mapInsuranceStatus({
        providedBy: (h.insurance_provided_by as string | null) ?? null,
        hasDocument: Boolean(insurance?.filePath),
        expiryDate: insurance?.expiryDate ?? null,
        notifyDaysBefore: notifySettings.notify_insurance_days_before,
        todayYmd,
        hireStatus: String(h.status ?? ""),
      }),
      settlementBalanceDirection:
        settlementDirection === "driver_owes_company" ||
        settlementDirection === "company_owes_driver" ||
        settlementDirection === "settled"
          ? settlementDirection
          : null,
      settlementOpenBalanceGbp: Number(h.settlement_balance_gbp ?? 0),
      rentBillingMode: billingMode,
    };
  });

  const hireById = new Map(hireFacts.map((h) => [h.id, h]));

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
        hireGroupId: hire.id,
        vehicleId: hire.vehicleId,
        subcompanyId: hire.subcompanyId,
        periodStart: (row.period_start as string).slice(0, 10),
        periodEnd: (row.period_end as string).slice(0, 10),
        rowKind: row.row_kind as string,
        paymentStatus,
        approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp,
      });
    }

    const scheduleIdToHire = new Map(
      (scheduleRows ?? []).map((r) => [r.id as string, r.hire_group_id as string]),
    );
    const scheduleIds = [...scheduleIdToHire.keys()];
    for (const eventIds of chunkIds(scheduleIds)) {
      const { data: paymentEvents } = await supabase
        .from("vehicle_hire_payment_status_events")
        .select("id, schedule_row_id, to_status, created_at")
        .in("schedule_row_id", eventIds)
        .eq("event_kind", "status_change")
        .in("to_status", ["approved", "rejected"])
        .order("created_at", { ascending: false })
        .limit(40);
      for (const event of paymentEvents ?? []) {
        const hireGroupId = scheduleIdToHire.get(event.schedule_row_id as string);
        if (!hireGroupId) continue;
        const hire = hireById.get(hireGroupId);
        if (!hire) continue;
        if (requestedSub && hire.subcompanyId !== requestedSub) continue;
        const vehicle = vehicleById.get(hire.vehicleId);
        const toStatus = event.to_status as string;
        activityFacts.push({
          id: `pay-${event.id as string}`,
          at: event.created_at as string,
          title: toStatus === "approved" ? "Payment approved" : "Payment rejected",
          detail: vehicle ? `${vehicle.vrm} · ${vehicle.subcompanyName}` : "Hire payment update",
          href: `/rental/balances/${hire.id}`,
          groupKey: `payment:${hire.id}:${toStatus}`,
        });
      }
    }
  }

  let maintenanceQuery = supabase
    .from("vehicle_maintenance_records")
    .select("id, vehicle_id, subcompany_id, occurred_on, amount_gbp, category, created_at")
    .eq("parent_company_id", parentCompanyId)
    .gte("occurred_on", period.previousStartYmd)
    .lte("occurred_on", period.endYmd)
    .order("occurred_on", { ascending: false });
  if (accessible !== "all") maintenanceQuery = maintenanceQuery.in("subcompany_id", accessibleIds);
  if (requestedSub) maintenanceQuery = maintenanceQuery.eq("subcompany_id", requestedSub);

  const { data: maintenanceRows, error: mErr } = await maintenanceQuery;
  if (mErr) return { ok: false, error: mErr.message };
  for (const row of maintenanceRows ?? []) {
    maintenanceFacts.push({
      vehicleId: row.vehicle_id as string,
      subcompanyId: row.subcompany_id as string,
      occurredOn: (row.occurred_on as string).slice(0, 10),
      amountGbp: Number(row.amount_gbp ?? 0),
    });
  }

  // Activity also needs maintenance outside chart window — load recent separately.
  let recentMaintenanceQuery = supabase
    .from("vehicle_maintenance_records")
    .select("id, vehicle_id, subcompany_id, occurred_on, category, created_at, amount_gbp")
    .eq("parent_company_id", parentCompanyId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (accessible !== "all") recentMaintenanceQuery = recentMaintenanceQuery.in("subcompany_id", accessibleIds);
  if (requestedSub) recentMaintenanceQuery = recentMaintenanceQuery.eq("subcompany_id", requestedSub);
  const { data: recentMaintenance } = await recentMaintenanceQuery;
  for (const row of recentMaintenance ?? []) {
    if (requestedSub && (row.subcompany_id as string) !== requestedSub) continue;
    const vehicle = vehicleById.get(row.vehicle_id as string);
    activityFacts.push({
      id: `maint-${row.id as string}`,
      at: (row.created_at as string) ?? `${row.occurred_on as string}T00:00:00Z`,
      title: "Maintenance recorded",
      detail: vehicle
        ? `${vehicle.vrm} · ${String(row.category ?? "maintenance")}`
        : String(row.category ?? "Maintenance"),
      href: vehicle ? `/rental/vehicles/${vehicle.id}/maintenance` : "/rental/vehicles",
      groupKey: `maintenance:${row.vehicle_id as string}`,
    });
  }

  // Broader maintenance for chart (up to 6 months before period end).
  const chartLookbackStart = (() => {
    const [y, m] = period.endYmd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 - 5, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();
  if (chartLookbackStart < period.previousStartYmd) {
    let chartMaintQuery = supabase
      .from("vehicle_maintenance_records")
      .select("vehicle_id, subcompany_id, occurred_on, amount_gbp")
      .eq("parent_company_id", parentCompanyId)
      .gte("occurred_on", chartLookbackStart)
      .lt("occurred_on", period.previousStartYmd);
    if (accessible !== "all") chartMaintQuery = chartMaintQuery.in("subcompany_id", accessibleIds);
    if (requestedSub) chartMaintQuery = chartMaintQuery.eq("subcompany_id", requestedSub);
    const { data: chartMaint } = await chartMaintQuery;
    for (const row of chartMaint ?? []) {
      maintenanceFacts.push({
        vehicleId: row.vehicle_id as string,
        subcompanyId: row.subcompany_id as string,
        occurredOn: (row.occurred_on as string).slice(0, 10),
        amountGbp: Number(row.amount_gbp ?? 0),
      });
    }
  }

  for (const ids of chunkIds(hireIds)) {
    const { data: hireEvents } = await supabase
      .from("vehicle_hire_group_events")
      .select("id, hire_group_id, event_type, summary, metadata, created_at")
      .in("hire_group_id", ids)
      .order("created_at", { ascending: false })
      .limit(40);
    for (const event of hireEvents ?? []) {
      const hire = hireById.get(event.hire_group_id as string);
      if (!hire) continue;
      if (requestedSub && hire.subcompanyId !== requestedSub) continue;
      const meta = (event.metadata ?? {}) as Record<string, unknown>;
      const toStatus = typeof meta.to_status === "string" ? meta.to_status : typeof meta.status === "string" ? meta.status : null;
      const title = dashboardActivityTitleForHireEvent(event.event_type as string, toStatus);
      if (!title) continue;
      const vehicle = vehicleById.get(hire.vehicleId);
      activityFacts.push({
        id: `hire-${event.id as string}`,
        at: event.created_at as string,
        title,
        detail: vehicle ? `${vehicle.vrm} · ${vehicle.subcompanyName}` : (event.summary as string) || title,
        href: `/rental/hires/${hire.id}`,
        groupKey: `hire:${hire.id}:${title}`,
      });
    }
  }

  const { data: transfers } = await supabase
    .from("vehicle_transfers")
    .select(
      "id, vehicle_id, from_subcompany_id, to_subcompany_id, transferred_at, parent_company_id",
    )
    .eq("parent_company_id", parentCompanyId)
    .order("transferred_at", { ascending: false })
    .limit(20);
  const subNameById = new Map(subcompanies.map((s) => [s.id, s.name]));
  for (const transfer of transfers ?? []) {
    const vehicle = vehicleById.get(transfer.vehicle_id as string);
    if (!vehicle) continue;
    if (requestedSub) {
      const fromId = transfer.from_subcompany_id as string;
      const toId = transfer.to_subcompany_id as string;
      if (fromId !== requestedSub && toId !== requestedSub) continue;
    } else if (accessible !== "all") {
      const fromId = transfer.from_subcompany_id as string;
      const toId = transfer.to_subcompany_id as string;
      if (!accessible.includes(fromId) && !accessible.includes(toId)) continue;
    }
    const fromName = subNameById.get(transfer.from_subcompany_id as string) ?? "Subcompany";
    const toName = subNameById.get(transfer.to_subcompany_id as string) ?? "Subcompany";
    activityFacts.push({
      id: `xfer-${transfer.id as string}`,
      at: transfer.transferred_at as string,
      title: "Vehicle transferred",
      detail: `${vehicle.vrm} · ${fromName} → ${toName}`,
      href: `/rental/vehicles/${vehicle.id}`,
      groupKey: `transfer:${transfer.vehicle_id as string}`,
    });
  }

  const { data: recentDocs } = await supabase
    .from("vehicle_documents")
    .select("id, vehicle_id, doc_type, created_at, parent_company_id")
    .eq("parent_company_id", parentCompanyId)
    .eq("version_status", "current")
    .order("created_at", { ascending: false })
    .limit(20);
  for (const doc of recentDocs ?? []) {
    const vehicle = vehicleById.get(doc.vehicle_id as string);
    if (!vehicle) continue;
    if (requestedSub && vehicle.subcompanyId !== requestedSub) continue;
    activityFacts.push({
      id: `doc-${doc.id as string}`,
      at: doc.created_at as string,
      title: "Document uploaded",
      detail: `${vehicle.vrm} · ${String(doc.doc_type ?? "document")}`,
      href: `/rental/vehicles/${vehicle.id}/details`,
      groupKey: `document:${vehicle.id}:${String(doc.doc_type ?? "")}`,
    });
  }

  const companyName = life.kind === "rental" ? life.companyName ?? "Your company" : "Your company";

  return {
    ok: true,
    data: buildCompanyDashboardPayload({
      companyName,
      period,
      todayYmd,
      selectedSubcompanyId: requestedSub,
      subcompanies,
      vehicles: [...vehicleById.values()],
      hires: hireFacts,
      scheduleRows: scheduleFacts,
      maintenance: maintenanceFacts,
      activity: activityFacts,
      notifySettings,
      canWriteRentals: canWriteRentals(profile),
      canManageFleet: canManageFleet(profile),
      canManageFleetTracking: canManageFleetTracking(profile),
    }),
  };
}

export async function loadCompanyDashboardAction(query: CompanyDashboardQuery = {}): Promise<LoadResult> {
  try {
    return await buildDashboardPayload(query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the company dashboard.";
    return { ok: false, error: message };
  }
}

export async function exportCompanyDashboardAction(query: CompanyDashboardQuery = {}): Promise<ExportResult> {
  const loaded = await loadCompanyDashboardAction(query);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    csv: buildCompanyDashboardExportCsv(loaded.data),
    fileName: companyDashboardExportFileName(loaded.data.period),
  };
}
