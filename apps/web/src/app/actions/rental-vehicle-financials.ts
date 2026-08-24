"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageFleet, canReadMaintenance } from "@/lib/auth/rental-permissions";
import {
  normalizeRequiresAccount,
  paymentMethodRequiresAccount,
  type PaymentAccountRow,
  type PaymentMethodRow,
} from "@/lib/fleet/maintenance";
import {
  isOwnershipEventType,
  type OwnershipEventType,
  type VehicleOwnershipEventRow,
} from "@/lib/fleet/vehicles";
import {
  computeVehicleHireIncomeGbp,
  hireContractEndYmd,
  type HireIncomeGroupContext,
  type VehicleHireIncomeScheduleRow,
} from "@/lib/fleet/hire-income";
import {
  mapDriverChargeLineItemsFromDb,
  type DriverChargeLineItemDbRow,
  type HireDriverChargeLineItemInput,
} from "@/lib/fleet/hire-driver-charges";
import {
  buildPaymentRowEventStateMap,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { computeVehiclePnl, type VehiclePnlBreakdown } from "@/lib/fleet/vehicle-pnl";
import { revalidateVehicleWorkspaceCache } from "@/lib/fleet/vehicle-workspace-cache";
import { rebuildHireFinancialSummary } from "@/lib/fleet/hire-finance-rebuild";
import { createClient } from "@/lib/supabase/server";
import { parseUkDate } from "@/lib/validation/driver-signup";
import { ensureDefaultPaymentMethodsAction } from "@/app/actions/rental-payment-settings";

function revalidateFinancials(vehicleId: string) {
  revalidateVehicleWorkspaceCache(vehicleId);
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}/financials`);
  revalidatePath("/rental/vehicles");
  revalidatePath(`/rental/vehicles/${vehicleId}`, "layout");
}

export async function revalidateVehicleFinancialsForHireGroup(hireGroupId: string): Promise<void> {
  const id = hireGroupId.trim();
  if (!id) return;
  try {
    await rebuildHireFinancialSummary(id);
  } catch (error) {
    console.error("revalidateVehicleFinancialsForHireGroup: rebuild", error);
  }
  const supabase = await createClient();
  const { data } = await supabase.from("vehicle_hire_groups").select("vehicle_id").eq("id", id).maybeSingle();
  const vehicleId = (data?.vehicle_id as string | null) ?? null;
  if (vehicleId) revalidateFinancials(vehicleId);
}

function parseAmount(raw: string | number): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/£/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Amount must be a non-negative number." };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseOccurredOn(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const s = raw.trim().slice(0, 10);
  if (!parseUkDate(s)) return { ok: false, error: "Enter a valid date (YYYY-MM-DD)." };
  return { ok: true, value: s };
}

export type VehicleFinancialsPageData = {
  vehicle: {
    id: string;
    vrm: string;
    make: string;
    model: string;
    status: string;
    subcompany_id: string;
  };
  purchase: VehicleOwnershipEventRow | null;
  sale: VehicleOwnershipEventRow | null;
  maintenanceTotalGbp: number;
  pnl: VehiclePnlBreakdown;
  methods: PaymentMethodRow[];
  accounts: PaymentAccountRow[];
  canWrite: boolean;
};

async function loadPaymentLookups(companyId: string) {
  const supabase = await createClient();
  const [{ data: methodsRaw, error: mErr }, { data: accounts, error: aErr }] = await Promise.all([
    supabase
      .from("company_payment_methods")
      .select("id, parent_company_id, name, is_active, requires_account, sort_order, created_at")
      .eq("parent_company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("company_payment_accounts")
      .select("id, parent_company_id, name, notes, is_active, sort_order, created_at")
      .eq("parent_company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (mErr) return { ok: false as const, error: mErr.message };
  if (aErr) return { ok: false as const, error: aErr.message };

  const methods = (methodsRaw ?? []).map((m) => ({
    ...m,
    requires_account: normalizeRequiresAccount(m.name, m.requires_account),
  })) as PaymentMethodRow[];

  return {
    ok: true as const,
    methods,
    accounts: (accounts ?? []) as PaymentAccountRow[],
  };
}

function mapEventRow(
  row: Record<string, unknown>,
  methodName: Map<string, string>,
  accountName: Map<string, string>,
): VehicleOwnershipEventRow {
  const amount = typeof row.amount_gbp === "string" ? Number.parseFloat(row.amount_gbp) : Number(row.amount_gbp);
  const methodId = (row.payment_method_id as string | null) ?? null;
  const accountId = (row.payment_account_id as string | null) ?? null;
  return {
    id: row.id as string,
    vehicle_id: row.vehicle_id as string,
    parent_company_id: row.parent_company_id as string,
    subcompany_id: row.subcompany_id as string,
    event_type: row.event_type as OwnershipEventType,
    occurred_on: row.occurred_on as string,
    amount_gbp: Number.isFinite(amount) ? amount : 0,
    counterparty: (row.counterparty as string) ?? "",
    payment_method_id: methodId,
    payment_account_id: accountId,
    payment_reference: (row.payment_reference as string) ?? "",
    notes: (row.notes as string | null) ?? null,
    recorded_by: (row.recorded_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    payment_method_name: methodId ? methodName.get(methodId) ?? null : null,
    payment_account_name: accountId ? accountName.get(accountId) ?? null : null,
  };
}

function parseRentBillingMode(raw: unknown): HireTerminationRentBillingMode {
  return raw === "actual" ? "actual" : "end_of_period";
}

type HireGroupIncomeSource = {
  id: string;
  status: string;
  terminated_at: string | null;
  ended_at: string | null;
  settlement_discount_gbp: number | string | null;
  rent_cadence?: string | null;
  termination_settlement?: unknown;
  deposit_disposition?: string | null;
  deposit_refund_amount_gbp?: number | string | null;
  settlement_balance_direction?: string | null;
  settlement_balance_gbp?: number | string | null;
};

function parseTerminationDepositGbp(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const depositGbp = (raw as { depositGbp?: number }).depositGbp;
  return Number.isFinite(depositGbp) ? Number(depositGbp) : 0;
}

function parseTerminationSignedRentBalanceGbp(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const signed = (raw as { signedRentBalanceGbp?: number }).signedRentBalanceGbp;
  return Number.isFinite(signed) ? Number(signed) : null;
}

function parseTerminationAccruedRentPaidGbp(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const paid = (raw as { accruedRentPaidGbp?: number }).accruedRentPaidGbp;
  return Number.isFinite(paid) ? Number(paid) : null;
}

function parseTerminationAccruedRentDueGbp(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const due = (raw as { accruedRentDueGbp?: number }).accruedRentDueGbp;
  return Number.isFinite(due) ? Number(due) : null;
}

function buildGroupContextByGroupId(groups: readonly HireGroupIncomeSource[]): Map<string, HireIncomeGroupContext> {
  return new Map(
    groups.map((group) => {
      const terminationSettlement = group.termination_settlement as { rentBillingMode?: string } | null;
      return [
        group.id,
        {
          contractEndedYmd: hireContractEndYmd({
            status: String(group.status ?? ""),
            terminatedAt: group.terminated_at,
            endedAt: group.ended_at,
          }),
          rentCadence: (group.rent_cadence as RentCadence) ?? "weekly",
          rentBillingMode: parseRentBillingMode(terminationSettlement?.rentBillingMode),
          settlementWriteOffGbp: Number(group.settlement_discount_gbp ?? 0),
          depositDisposition: (group.deposit_disposition as string | null) ?? null,
          depositRefundAmountGbp:
            group.deposit_refund_amount_gbp != null
              ? Number(group.deposit_refund_amount_gbp)
              : null,
          depositGbp: parseTerminationDepositGbp(group.termination_settlement),
          signedRentBalanceGbp: parseTerminationSignedRentBalanceGbp(group.termination_settlement),
          accruedRentPaidGbp: parseTerminationAccruedRentPaidGbp(group.termination_settlement),
          accruedRentDueGbp: parseTerminationAccruedRentDueGbp(group.termination_settlement),
          settlementSettled:
            computeHireWorkspaceSettlementBalance({
              settlementBalanceDirection: group.settlement_balance_direction ?? null,
              settlementBalanceGbp:
                group.settlement_balance_gbp != null ? Number(group.settlement_balance_gbp) : 0,
            })?.settled === true,
        },
      ];
    }),
  );
}

function mapScheduleIncomeRow(
  row: {
    id: string;
    hire_group_id: string;
    period_start: string;
    period_end: string;
    row_kind: string;
    payment_status: string;
    approved_amount_gbp: number | null;
    base_amount_gbp: number;
    vehicle_hire_schedule_discounts?: { amount_gbp: number }[];
  },
  eventStateByRow: Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>,
  todayYmd: string,
): VehicleHireIncomeScheduleRow {
  const discounts = row.vehicle_hire_schedule_discounts;
  const discountTotalGbp = (discounts ?? []).reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const storedStatus = row.payment_status as HirePaymentStatus;
  const eventState = eventStateByRow.get(row.id);
  const paymentStatus = resolveHirePaymentWorkflowStatus(
    storedStatus,
    eventState?.latestToStatus ?? null,
    { periodStartYmd: row.period_start, todayYmd },
  );
  return {
    hireGroupId: row.hire_group_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowKind: row.row_kind,
    paymentStatus,
    approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
    baseAmountGbp: Number(row.base_amount_gbp),
    discountTotalGbp,
  };
}

async function loadPaymentStatusEventsForRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rowIds: string[],
) {
  if (!rowIds.length) return new Map<string, { latestToStatus: string | null; pendingSubmittedGbp: number | null }>();

  const { data, error } = await supabase
    .from("vehicle_hire_payment_status_events")
    .select("schedule_row_id, to_status, amendment_payload, created_at")
    .in("schedule_row_id", rowIds)
    .eq("event_kind", "status_change")
    .order("created_at", { ascending: false });
  if (error) return new Map();

  return buildPaymentRowEventStateMap(
    (data ?? []).map((event) => ({
      schedule_row_id: event.schedule_row_id as string,
      to_status: (event.to_status as string | null) ?? null,
      amendment_payload: event.amendment_payload,
    })),
  );
}

type DbScheduleIncomeRow = {
  id: string;
  hire_group_id: string;
  period_start: string;
  period_end: string;
  row_kind: string;
  payment_status: string;
  approved_amount_gbp: number | null;
  base_amount_gbp: number;
  vehicle_hire_schedule_discounts?: { amount_gbp: number }[];
};

async function mapScheduleIncomeRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: readonly DbScheduleIncomeRow[],
  todayYmd: string,
): Promise<VehicleHireIncomeScheduleRow[]> {
  const rowIds = rows.map((row) => row.id);
  const eventStateByRow = await loadPaymentStatusEventsForRows(supabase, rowIds);
  return rows.map((row) => mapScheduleIncomeRow(row, eventStateByRow, todayYmd));
}

async function sumMaintenanceForVehicle(vehicleId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_maintenance_records")
    .select("amount_gbp")
    .eq("vehicle_id", vehicleId);
  if (error) return 0;
  let total = 0;
  for (const row of data ?? []) {
    const amount = typeof row.amount_gbp === "string" ? Number.parseFloat(row.amount_gbp) : Number(row.amount_gbp);
    if (Number.isFinite(amount)) total += amount;
  }
  return Math.round(total * 100) / 100;
}

async function loadVehicleHireIncomeContext(vehicleId: string): Promise<
  | {
      ok: true;
      scheduleRows: VehicleHireIncomeScheduleRow[];
      balancePayments: { hireGroupId: string; amountGbp: number; direction: string | null; paymentCategory: string | null }[];
      driverChargeLineItems: HireDriverChargeLineItemInput[];
      groupContextByGroupId: Map<string, HireIncomeGroupContext>;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: groups, error: groupsErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, terminated_at, ended_at, settlement_discount_gbp, rent_cadence, termination_settlement, deposit_disposition, deposit_refund_amount_gbp, settlement_balance_direction, settlement_balance_gbp",
    )
    .eq("vehicle_id", vehicleId);
  if (groupsErr) return { ok: false, error: groupsErr.message };

  const groupIds = (groups ?? []).map((g) => g.id as string);
  const groupContextByGroupId = buildGroupContextByGroupId(
    (groups ?? []).map((group) => ({
      id: group.id as string,
      status: String(group.status ?? ""),
      terminated_at: (group.terminated_at as string | null) ?? null,
      ended_at: (group.ended_at as string | null) ?? null,
      settlement_discount_gbp: group.settlement_discount_gbp,
      rent_cadence: group.rent_cadence as string | null,
      termination_settlement: group.termination_settlement,
      deposit_disposition: group.deposit_disposition as string | null,
      deposit_refund_amount_gbp: group.deposit_refund_amount_gbp,
      settlement_balance_direction: (group.settlement_balance_direction as string | null) ?? null,
      settlement_balance_gbp: group.settlement_balance_gbp,
    })),
  );
  if (!groupIds.length) {
    return {
      ok: true,
      scheduleRows: [],
      balancePayments: [],
      driverChargeLineItems: [],
      groupContextByGroupId,
    };
  }

  const todayYmd = ukTodayYmd();
  const [
    { data: rows, error },
    { data: balanceRows, error: balanceErr },
    { data: chargeRows, error: chargeErr },
  ] = await Promise.all([
    supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .in("hire_group_id", groupIds),
    supabase
      .from("vehicle_hire_balance_payments")
      .select("hire_group_id, amount_gbp, direction, payment_category")
      .in("hire_group_id", groupIds),
    supabase
      .from("vehicle_hire_driver_charge_line_items")
      .select("id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description")
      .in("hire_group_id", groupIds),
  ]);
  if (error) return { ok: false, error: error.message };
  if (balanceErr) return { ok: false, error: balanceErr.message };
  if (chargeErr) return { ok: false, error: chargeErr.message };

  const scheduleRows = await mapScheduleIncomeRows(
    supabase,
    (rows ?? []) as DbScheduleIncomeRow[],
    todayYmd,
  );

  const balancePayments = (balanceRows ?? []).map((payment) => ({
    hireGroupId: payment.hire_group_id as string,
    amountGbp: Number(payment.amount_gbp ?? 0),
    direction: (payment.direction as string | null) ?? null,
    paymentCategory: (payment.payment_category as string | null) ?? null,
  }));
  const driverChargeLineItems = mapDriverChargeLineItemsFromDb(
    (chargeRows ?? []) as DriverChargeLineItemDbRow[],
  ).map((item) => ({
    hireGroupId: item.hireGroupId,
    chargeType: item.chargeType,
    amountGbp: item.amountGbp,
    resolution: item.resolution,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    description: item.description,
  }));

  return { ok: true, scheduleRows, balancePayments, driverChargeLineItems, groupContextByGroupId };
}

/**
 * Net hire income for a vehicle (same calculation as Financials P&L).
 * Caller must already authorise vehicle access and rentals/financials read.
 */
export async function loadVehicleHireIncomeNetGbp(vehicleId: string): Promise<
  { ok: true; netIncomeGbp: number } | { ok: false; error: string }
> {
  const hireIncomeContext = await loadVehicleHireIncomeContext(vehicleId);
  if (!hireIncomeContext.ok) return { ok: false, error: hireIncomeContext.error };
  const hireIncome = computeVehicleHireIncomeGbp({
    scheduleRows: hireIncomeContext.scheduleRows,
    balancePayments: hireIncomeContext.balancePayments,
    driverChargeLineItems: hireIncomeContext.driverChargeLineItems,
    groupContextByGroupId: hireIncomeContext.groupContextByGroupId,
    todayYmd: ukTodayYmd(),
  });
  return { ok: true, netIncomeGbp: hireIncome.netIncomeGbp };
}

export async function loadVehiclePurchaseDateAction(
  vehicleId: string,
): Promise<{ ok: true; occurredOn: string | null } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to view purchase details." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const { data, error } = await supabase
    .from("vehicle_ownership_events")
    .select("occurred_on")
    .eq("vehicle_id", id)
    .eq("event_type", "purchase")
    .order("occurred_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return { ok: true, occurredOn: (data?.occurred_on as string | null) ?? null };
}

export async function loadVehicleFinancialsAction(
  vehicleId: string,
): Promise<{ ok: true; data: VehicleFinancialsPageData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to view financials." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, vrm, make, model, status, subcompany_id")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const [lookups, { data: events, error: eErr }, maintenanceTotalGbp, hireIncomeContext] = await Promise.all([
    loadPaymentLookups(companyId),
    supabase
      .from("vehicle_ownership_events")
      .select(
        "id, vehicle_id, parent_company_id, subcompany_id, event_type, occurred_on, amount_gbp, counterparty, payment_method_id, payment_account_id, payment_reference, notes, recorded_by, created_at, updated_at",
      )
      .eq("vehicle_id", id)
      .order("occurred_on", { ascending: true }),
    sumMaintenanceForVehicle(id),
    loadVehicleHireIncomeContext(id),
  ]);

  if (!lookups.ok) return { ok: false, error: lookups.error };
  if (eErr) return { ok: false, error: eErr.message };
  if (!hireIncomeContext.ok) return { ok: false, error: hireIncomeContext.error };

  const methodName = new Map(lookups.methods.map((m) => [m.id, m.name]));
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));

  let purchase: VehicleOwnershipEventRow | null = null;
  let sale: VehicleOwnershipEventRow | null = null;
  for (const row of events ?? []) {
    const mapped = mapEventRow(row as Record<string, unknown>, methodName, accountName);
    if (mapped.event_type === "purchase") purchase = mapped;
    if (mapped.event_type === "sale") sale = mapped;
  }

  const hireIncome = computeVehicleHireIncomeGbp({
    scheduleRows: hireIncomeContext.scheduleRows,
    balancePayments: hireIncomeContext.balancePayments,
    driverChargeLineItems: hireIncomeContext.driverChargeLineItems,
    groupContextByGroupId: hireIncomeContext.groupContextByGroupId,
    todayYmd: ukTodayYmd(),
  });
  const pnl = computeVehiclePnl({
    purchaseGbp: purchase?.amount_gbp ?? null,
    saleGbp: sale?.amount_gbp ?? null,
    maintenanceTotalGbp,
    rentalIncomeGbp: hireIncome.netIncomeGbp,
    rentalGrossIncomeGbp: hireIncome.grossApprovedGbp,
    rentalRefundsGbp: hireIncome.refundsToDriverGbp,
    rentalPrepaidExcludedGbp: hireIncome.postEndPrepaidExcludedGbp,
    rentalCollectionsGbp: hireIncome.collectionsFromDriverGbp,
    rentalWriteOffsGbp: hireIncome.settlementWriteOffsGbp,
    rentalDepositRetentionGbp: hireIncome.depositRetentionGbp,
    driverChargeIncomeGbp: hireIncome.driverChargeIncomeGbp,
  });

  return {
    ok: true,
    data: {
      vehicle,
      purchase,
      sale,
      maintenanceTotalGbp,
      pnl,
      methods: lookups.methods,
      accounts: lookups.accounts,
      canWrite: canManageFleet(profile),
    },
  };
}

export type SaveOwnershipEventInput = {
  vehicleId: string;
  eventType: OwnershipEventType;
  occurred_on: string;
  amount_gbp: string | number;
  counterparty?: string;
  payment_method_id?: string | null;
  payment_account_id?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
};

async function validatePaymentFields(
  companyId: string,
  methodId: string | null | undefined,
  accountId: string | null | undefined,
  methods: PaymentMethodRow[],
): Promise<{ ok: true; methodId: string | null; accountId: string | null } | { ok: false; error: string }> {
  const mid = methodId?.trim() || null;
  const aid = accountId?.trim() || null;
  if (!mid) return { ok: true, methodId: null, accountId: null };

  const method = methods.find((m) => m.id === mid);
  if (!method || method.parent_company_id !== companyId) {
    return { ok: false, error: "Invalid payment method." };
  }
  if (paymentMethodRequiresAccount(method) && !aid) {
    return { ok: false, error: "Payment account is required for this method." };
  }
  return { ok: true, methodId: mid, accountId: aid };
}

export async function saveVehicleOwnershipEventAction(
  input: SaveOwnershipEventInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return { ok: false, error: "Missing vehicle." };
  if (!isOwnershipEventType(input.eventType)) return { ok: false, error: "Invalid event type." };

  const occurred = parseOccurredOn(input.occurred_on);
  if (!occurred.ok) return occurred;
  const amount = parseAmount(input.amount_gbp);
  if (!amount.ok) return amount;

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id, status")
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  if (vehicle.status === "sold" && input.eventType === "purchase") {
    return { ok: false, error: "Cannot change purchase on a sold vehicle." };
  }

  await ensureDefaultPaymentMethodsAction();
  const lookups = await loadPaymentLookups(companyId);
  if (!lookups.ok) return { ok: false, error: lookups.error };

  const payment = await validatePaymentFields(
    companyId,
    input.payment_method_id,
    input.payment_account_id,
    lookups.methods,
  );
  if (!payment.ok) return payment;

  const { data: existing, error: exErr } = await supabase
    .from("vehicle_ownership_events")
    .select("id, event_type")
    .eq("vehicle_id", vehicleId)
    .eq("event_type", input.eventType)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  const payload = {
    occurred_on: occurred.value,
    amount_gbp: amount.value,
    counterparty: input.counterparty?.trim() ?? "",
    payment_method_id: payment.methodId,
    payment_account_id: payment.accountId,
    payment_reference: input.payment_reference?.trim() ?? "",
    notes: input.notes?.trim() || null,
    recorded_by: user.id,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("vehicle_ownership_events")
      .update(payload)
      .eq("id", existing.id)
      .eq("vehicle_id", vehicleId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("vehicle_ownership_events").insert({
      vehicle_id: vehicleId,
      event_type: input.eventType,
      ...payload,
    });
    if (error) return { ok: false, error: error.message };
  }

  if (input.eventType === "sale") {
    const { error: statusErr } = await supabase
      .from("vehicles")
      .update({ status: "sold" })
      .eq("id", vehicleId)
      .eq("parent_company_id", companyId);
    if (statusErr) return { ok: false, error: statusErr.message };
  }

  revalidateFinancials(vehicleId);
  return { ok: true };
}

export async function recordVehiclePurchaseOnCreateAction(
  vehicleId: string,
  input: Omit<SaveOwnershipEventInput, "vehicleId" | "eventType">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveVehicleOwnershipEventAction({
    vehicleId,
    eventType: "purchase",
    ...input,
  });
}
