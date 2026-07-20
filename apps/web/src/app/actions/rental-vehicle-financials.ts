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
import { computeVehiclePnl, type VehiclePnlBreakdown } from "@/lib/fleet/vehicle-pnl";
import { createClient } from "@/lib/supabase/server";
import { parseUkDate } from "@/lib/validation/driver-signup";
import { ensureDefaultPaymentMethodsAction } from "@/app/actions/rental-payment-settings";

function revalidateFinancials(vehicleId: string) {
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}/financials`);
  revalidatePath("/rental/vehicles");
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

  const [lookups, { data: events, error: eErr }, maintenanceTotalGbp] = await Promise.all([
    loadPaymentLookups(companyId),
    supabase
      .from("vehicle_ownership_events")
      .select(
        "id, vehicle_id, parent_company_id, subcompany_id, event_type, occurred_on, amount_gbp, counterparty, payment_method_id, payment_account_id, payment_reference, notes, recorded_by, created_at, updated_at",
      )
      .eq("vehicle_id", id)
      .order("occurred_on", { ascending: true }),
    sumMaintenanceForVehicle(id),
  ]);

  if (!lookups.ok) return { ok: false, error: lookups.error };
  if (eErr) return { ok: false, error: eErr.message };

  const methodName = new Map(lookups.methods.map((m) => [m.id, m.name]));
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));

  let purchase: VehicleOwnershipEventRow | null = null;
  let sale: VehicleOwnershipEventRow | null = null;
  for (const row of events ?? []) {
    const mapped = mapEventRow(row as Record<string, unknown>, methodName, accountName);
    if (mapped.event_type === "purchase") purchase = mapped;
    if (mapped.event_type === "sale") sale = mapped;
  }

  const pnl = computeVehiclePnl({
    purchaseGbp: purchase?.amount_gbp ?? null,
    saleGbp: sale?.amount_gbp ?? null,
    maintenanceTotalGbp,
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

export type FleetVehiclePnlSummary = {
  vehicleId: string;
  purchaseGbp: number | null;
  saleGbp: number | null;
  netPnlGbp: number | null;
  bookPositionGbp: number | null;
};

/** Batch P&L summaries for fleet list (same company scope as vehicles page). */
export async function loadFleetPnlSummariesAction(
  vehicleIds: string[],
): Promise<{ ok: true; summaries: FleetVehiclePnlSummary[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadMaintenance(profile)) return { ok: true, summaries: [] };
  const companyId = profile.company_id?.trim();
  if (!companyId || !vehicleIds.length) return { ok: true, summaries: [] };

  const supabase = await createClient();
  const ids = [...new Set(vehicleIds.map((id) => id.trim()).filter(Boolean))];

  const [{ data: events, error: eErr }, { data: maintRows, error: mErr }] = await Promise.all([
    supabase
      .from("vehicle_ownership_events")
      .select("vehicle_id, event_type, amount_gbp")
      .in("vehicle_id", ids),
    supabase.from("vehicle_maintenance_records").select("vehicle_id, amount_gbp").in("vehicle_id", ids),
  ]);
  if (eErr) return { ok: false, error: eErr.message };
  if (mErr) return { ok: false, error: mErr.message };

  const purchaseByVehicle = new Map<string, number>();
  const saleByVehicle = new Map<string, number>();
  for (const row of events ?? []) {
    const amount =
      typeof row.amount_gbp === "string" ? Number.parseFloat(row.amount_gbp) : Number(row.amount_gbp);
    if (!Number.isFinite(amount)) continue;
    if (row.event_type === "purchase") purchaseByVehicle.set(row.vehicle_id, amount);
    if (row.event_type === "sale") saleByVehicle.set(row.vehicle_id, amount);
  }

  const maintByVehicle = new Map<string, number>();
  for (const row of maintRows ?? []) {
    const amount =
      typeof row.amount_gbp === "string" ? Number.parseFloat(row.amount_gbp) : Number(row.amount_gbp);
    if (!Number.isFinite(amount)) continue;
    maintByVehicle.set(row.vehicle_id, (maintByVehicle.get(row.vehicle_id) ?? 0) + amount);
  }

  const summaries: FleetVehiclePnlSummary[] = ids.map((vehicleId) => {
    const purchaseGbp = purchaseByVehicle.get(vehicleId) ?? null;
    const saleGbp = saleByVehicle.get(vehicleId) ?? null;
    const maintenanceTotalGbp = Math.round((maintByVehicle.get(vehicleId) ?? 0) * 100) / 100;
    const pnl = computeVehiclePnl({ purchaseGbp, saleGbp, maintenanceTotalGbp });
    return {
      vehicleId,
      purchaseGbp,
      saleGbp,
      netPnlGbp: pnl.netPnlGbp,
      bookPositionGbp: pnl.bookPositionGbp,
    };
  });

  return { ok: true, summaries };
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
