"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadMaintenance, canWriteMaintenance } from "@/lib/auth/rental-permissions";
import { parseCsv } from "@/lib/csv/parse-csv";
import {
  expiryFromStartOrOverride,
  isMaintenanceCategory,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_IMPORT_HEADERS,
  normalizeRequiresAccount,
  paymentMethodRequiresAccount,
  type MaintenanceCategory,
  type MaintenanceRecordRow,
  type PaymentAccountRow,
  type PaymentMethodRow,
} from "@/lib/fleet/maintenance";
import { buildMaintenanceExcelTemplate, parseMaintenanceExcel } from "@/lib/fleet/maintenance-excel";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseUkDate } from "@/lib/validation/driver-signup";
import { ensureDefaultPaymentMethodsAction } from "@/app/actions/rental-payment-settings";

const IMPORT_MAX_ROWS = 500;

function revalidateMaintenance(vehicleId: string) {
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}/maintenance`);
  revalidatePath(`/rental/vehicles/${vehicleId}/details`);
}

function parseOptionalMiles(raw: string | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Mileage must be a non-negative whole number." };
  return { ok: true, value: n };
}

function parseAmount(raw: string | number): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/£/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Amount must be a non-negative number." };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (parseUkDate(s)) return s.slice(0, 10);
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (uk) {
    const d = Number(uk[1]);
    const m = Number(uk[2]);
    const y = Number(uk[3]);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return parseUkDate(iso) ? iso : null;
  }
  return null;
}

function normalizeMethods(
  rows: {
    id: string;
    parent_company_id: string;
    name: string;
    is_active: boolean;
    requires_account?: boolean | null;
    sort_order: number;
    created_at: string;
  }[],
): PaymentMethodRow[] {
  return rows.map((m) => ({
    ...m,
    requires_account: normalizeRequiresAccount(m.name, m.requires_account),
  }));
}

export type MaintenanceStaffOption = { user_id: string; label: string };

export type VehicleMaintenancePageData = {
  records: MaintenanceRecordRow[];
  totalAmount: number;
  yearTotalAmount: number;
  methods: PaymentMethodRow[];
  accounts: PaymentAccountRow[];
  staff: MaintenanceStaffOption[];
  canWrite: boolean;
  vehicle: {
    id: string;
    vrm: string;
    make: string;
    model: string;
    subcompany_id: string;
    service_due_at: string | null;
    next_service_mileage: number | null;
    mot_expiry: string | null;
    tax_expiry: string | null;
    phv_licence_expiry: string | null;
  };
};

async function loadStaffOptions(companyId: string): Promise<MaintenanceStaffOption[]> {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("user_company_memberships")
    .select("user_id")
    .eq("parent_company_id", companyId)
    .eq("status", "active");
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  if (!userIds.length) return [];

  const nameByUser = new Map<string, string | null>();
  const emailByUser = new Map<string, string | null>();
  try {
    const admin = createSupabaseAdminClient();
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", userIds);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
    await Promise.all(
      userIds.map(async (uid) => {
        const { data, error } = await admin.auth.admin.getUserById(uid);
        if (!error && data.user) emailByUser.set(uid, data.user.email ?? null);
      }),
    );
  } catch {
    // Fallback: ids only
  }

  return userIds.map((uid) => {
    const name = nameByUser.get(uid)?.trim();
    const email = emailByUser.get(uid)?.trim();
    return { user_id: uid, label: name || email || uid.slice(0, 8) };
  });
}

export async function loadVehicleMaintenancePageAction(
  vehicleId: string,
): Promise<{ ok: true; data: VehicleMaintenancePageData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to view maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, vrm, make, model, subcompany_id, service_due_at, next_service_mileage, mot_expiry, tax_expiry, phv_licence_expiry")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const [{ data: rows, error: rErr }, { data: methodsRaw, error: mErr }, { data: accounts, error: aErr }, staff] =
    await Promise.all([
      supabase
        .from("vehicle_maintenance_records")
        .select(
          "id, parent_company_id, subcompany_id, vehicle_id, occurred_on, category, description, amount_gbp, odometer_miles, paid_to, paid_by_user_id, paid_by_label, payment_method_id, payment_account_id, payment_reference, source, created_by, created_at, updated_at",
        )
        .eq("vehicle_id", id)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false }),
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
      loadStaffOptions(companyId),
    ]);

  if (rErr) return { ok: false, error: rErr.message };
  if (mErr) return { ok: false, error: mErr.message };
  if (aErr) return { ok: false, error: aErr.message };

  const methods = (methodsRaw ?? []).map((m) => ({
    ...m,
    requires_account: normalizeRequiresAccount(m.name, m.requires_account),
  })) as PaymentMethodRow[];
  const methodName = new Map(methods.map((m) => [m.id, m.name]));
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const staffLabel = new Map(staff.map((s) => [s.user_id, s.label]));

  const records: MaintenanceRecordRow[] = (rows ?? []).map((r) => {
    const amount = typeof r.amount_gbp === "string" ? Number.parseFloat(r.amount_gbp) : Number(r.amount_gbp);
    const paidByDisplay =
      (r.paid_by_user_id ? staffLabel.get(r.paid_by_user_id) : null) || r.paid_by_label?.trim() || null;
    return {
      ...(r as Omit<MaintenanceRecordRow, "amount_gbp" | "category" | "source">),
      category: r.category as MaintenanceCategory,
      source: (r.source as MaintenanceRecordRow["source"]) ?? "manual",
      amount_gbp: Number.isFinite(amount) ? amount : 0,
      payment_account_id: r.payment_account_id ?? null,
      payment_reference: r.payment_reference ?? "",
      payment_method_name: methodName.get(r.payment_method_id) ?? null,
      payment_account_name: r.payment_account_id ? accountName.get(r.payment_account_id) ?? null : null,
      paid_by_display: paidByDisplay,
    };
  });

  const year = new Date().getFullYear();
  let totalAmount = 0;
  let yearTotalAmount = 0;
  for (const r of records) {
    totalAmount += r.amount_gbp;
    if (r.occurred_on?.startsWith(String(year))) yearTotalAmount += r.amount_gbp;
  }

  return {
    ok: true,
    data: {
      records,
      totalAmount,
      yearTotalAmount,
      methods,
      accounts: (accounts ?? []) as PaymentAccountRow[],
      staff,
      canWrite: canWriteMaintenance(profile),
      vehicle,
    },
  };
}

export type SaveMaintenanceInput = {
  vehicleId: string;
  id?: string;
  occurred_on: string;
  category: string;
  description: string;
  amount_gbp: number | string;
  odometer_miles?: string | number | null;
  paid_to: string;
  paid_by_user_id?: string | null;
  paid_by_label?: string | null;
  payment_method_id: string;
  payment_account_id?: string | null;
  /** Optional bank / card / transfer reference */
  payment_reference?: string | null;
  /** MOT start/test date — default expiry is start + 1 year */
  mot_date?: string | null;
  /** Optional override for vehicle.mot_expiry (defaults to mot_date + 1 year) */
  mot_expiry?: string | null;
  /** When category is tax — sets vehicle.tax_expiry (required; no default) */
  tax_expiry?: string | null;
  /** PHV/Taxi licence start date — default expiry is start + 1 year */
  phv_start_date?: string | null;
  /** Optional override for vehicle.phv_licence_expiry (defaults to start + 1 year) */
  phv_licence_expiry?: string | null;
  service_due_at?: string | null;
  next_service_mileage?: string | number | null;
};

async function applyVehicleSideEffects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  vehicleId: string,
  opts: {
    category: MaintenanceCategory;
    occurred_on: string;
    odometer_miles: number | null;
    mot_date?: string | null;
    mot_expiry?: string | null;
    tax_expiry?: string | null;
    phv_start_date?: string | null;
    phv_licence_expiry?: string | null;
    service_due_at?: string | null;
    next_service_mileage?: string | number | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const vehiclePatch: Record<string, unknown> = {};

  if (opts.odometer_miles != null) {
    vehiclePatch.current_mileage = opts.odometer_miles;
  }

  if (opts.category === "mot") {
    const startRaw = opts.mot_date?.trim() || opts.occurred_on;
    const start = parseFlexibleDate(startRaw);
    if (!start) return { ok: false, error: "Enter a valid MOT start date." };
    const overrideRaw = opts.mot_expiry?.trim() ?? "";
    let override: string | null = null;
    if (overrideRaw) {
      override = parseFlexibleDate(overrideRaw);
      if (!override) return { ok: false, error: "Enter a valid MOT expiry date." };
    }
    const expiry = expiryFromStartOrOverride(start, override);
    if (!expiry) return { ok: false, error: "Could not calculate MOT expiry." };
    vehiclePatch.mot_expiry = expiry;
    vehiclePatch.mot_doc_attention_at = new Date().toISOString();
  }

  if (opts.category === "tax") {
    const raw = opts.tax_expiry?.trim() ?? "";
    if (!raw) return { ok: false, error: "Enter the new tax expiry date." };
    const iso = parseFlexibleDate(raw);
    if (!iso) return { ok: false, error: "Enter a valid tax expiry date." };
    vehiclePatch.tax_expiry = iso;
  }

  if (opts.category === "phv_taxi_licence") {
    const startRaw = opts.phv_start_date?.trim() || opts.occurred_on;
    const start = parseFlexibleDate(startRaw);
    if (!start) return { ok: false, error: "Enter a valid PHV/Taxi licence start date." };
    const overrideRaw = opts.phv_licence_expiry?.trim() ?? "";
    let override: string | null = null;
    if (overrideRaw) {
      override = parseFlexibleDate(overrideRaw);
      if (!override) return { ok: false, error: "Enter a valid PHV/Taxi licence expiry date." };
    }
    const expiry = expiryFromStartOrOverride(start, override);
    if (!expiry) return { ok: false, error: "Could not calculate PHV/Taxi licence expiry." };
    vehiclePatch.phv_licence_expiry = expiry;
    vehiclePatch.phv_doc_attention_at = new Date().toISOString();
  }

  if (opts.service_due_at !== undefined && opts.service_due_at !== null) {
    const due = String(opts.service_due_at).trim();
    if (due) {
      const iso = parseFlexibleDate(due);
      if (!iso) return { ok: false, error: "Service due date is invalid." };
      vehiclePatch.service_due_at = iso;
    }
  }

  if (opts.next_service_mileage !== undefined && opts.next_service_mileage !== null && String(opts.next_service_mileage).trim() !== "") {
    const nm = parseOptionalMiles(String(opts.next_service_mileage));
    if (!nm.ok) return nm;
    vehiclePatch.next_service_mileage = nm.value;
  }

  if (!Object.keys(vehiclePatch).length) return { ok: true };

  const { error } = await supabase
    .from("vehicles")
    .update(vehiclePatch)
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveMaintenanceRecordAction(
  input: SaveMaintenanceInput,
): Promise<{ ok: true; id: string; mot_expiry?: string; tax_expiry?: string; phv_licence_expiry?: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to edit maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return { ok: false, error: "Missing vehicle." };
  if (!isMaintenanceCategory(input.category)) return { ok: false, error: "Invalid category." };
  const occurred = parseFlexibleDate(input.occurred_on);
  if (!occurred) return { ok: false, error: "Enter a valid date (YYYY-MM-DD or DD/MM/YYYY)." };
  const amount = parseAmount(input.amount_gbp);
  if (!amount.ok) return amount;
  const miles = parseOptionalMiles(input.odometer_miles == null ? "" : String(input.odometer_miles));
  if (!miles.ok) return miles;
  if (!input.payment_method_id?.trim()) return { ok: false, error: "Select a payment method." };

  const supabase = await createClient();
  const { data: methodRow } = await supabase
    .from("company_payment_methods")
    .select("id, name, requires_account, is_active")
    .eq("id", input.payment_method_id.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (!methodRow?.is_active) return { ok: false, error: "Payment method not found or inactive." };

  const needsAccount = paymentMethodRequiresAccount({
    name: methodRow.name,
    requires_account: normalizeRequiresAccount(methodRow.name, methodRow.requires_account),
  });
  const accountId = input.payment_account_id?.trim() || null;
  if (needsAccount && !accountId) return { ok: false, error: "Select a payment account." };
  if (!needsAccount && accountId) {
    // ignore account for cash-like methods
  }

  const user = await getSessionUser();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, subcompany_id")
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const resolvedAccountId = needsAccount ? accountId : null;

  const payload = {
    vehicle_id: vehicleId,
    parent_company_id: companyId,
    subcompany_id: vehicle.subcompany_id,
    occurred_on: occurred,
    category: input.category,
    description: input.description?.trim() ?? "",
    amount_gbp: amount.value,
    odometer_miles: miles.value,
    paid_to: input.paid_to?.trim() ?? "",
    paid_by_user_id: input.paid_by_user_id?.trim() || null,
    paid_by_label: input.paid_by_user_id?.trim() ? null : input.paid_by_label?.trim() || null,
    payment_method_id: input.payment_method_id.trim(),
    payment_account_id: resolvedAccountId,
    payment_reference: input.payment_reference?.trim() ?? "",
    source: "manual" as const,
    created_by: user?.id ?? null,
  };

  let recordId = input.id?.trim() || "";

  if (recordId) {
    const { error } = await supabase
      .from("vehicle_maintenance_records")
      .update({
        occurred_on: payload.occurred_on,
        category: payload.category,
        description: payload.description,
        amount_gbp: payload.amount_gbp,
        odometer_miles: payload.odometer_miles,
        paid_to: payload.paid_to,
        paid_by_user_id: payload.paid_by_user_id,
        paid_by_label: payload.paid_by_label,
        payment_method_id: payload.payment_method_id,
        payment_account_id: payload.payment_account_id,
        payment_reference: payload.payment_reference,
      })
      .eq("id", recordId)
      .eq("vehicle_id", vehicleId)
      .eq("parent_company_id", companyId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("vehicle_maintenance_records").insert(payload).select("id").single();
    if (error) return { ok: false, error: error.message };
    recordId = data.id;
  }

  const side = await applyVehicleSideEffects(supabase, companyId, vehicleId, {
    category: input.category,
    occurred_on: occurred,
    odometer_miles: miles.value,
    mot_date: input.mot_date,
    mot_expiry: input.mot_expiry,
    tax_expiry: input.tax_expiry,
    phv_start_date: input.phv_start_date,
    phv_licence_expiry: input.phv_licence_expiry,
    service_due_at: input.service_due_at,
    next_service_mileage: input.next_service_mileage,
  });
  if (!side.ok) return side;

  let motExpiry: string | undefined;
  let taxExpiry: string | undefined;
  let phvExpiry: string | undefined;
  if (input.category === "mot") {
    const start = parseFlexibleDate(input.mot_date?.trim() || occurred);
    const override = input.mot_expiry?.trim() ? parseFlexibleDate(input.mot_expiry.trim()) : null;
    motExpiry = start ? expiryFromStartOrOverride(start, override) ?? undefined : undefined;
  }
  if (input.category === "tax") {
    taxExpiry = parseFlexibleDate(input.tax_expiry?.trim() ?? "") ?? undefined;
  }
  if (input.category === "phv_taxi_licence") {
    const start = parseFlexibleDate(input.phv_start_date?.trim() || occurred);
    const override = input.phv_licence_expiry?.trim()
      ? parseFlexibleDate(input.phv_licence_expiry.trim())
      : null;
    phvExpiry = start ? expiryFromStartOrOverride(start, override) ?? undefined : undefined;
  }

  revalidateMaintenance(vehicleId);
  return {
    ok: true,
    id: recordId,
    mot_expiry: motExpiry,
    tax_expiry: taxExpiry,
    phv_licence_expiry: phvExpiry,
  };
}

export async function deleteMaintenanceRecordAction(input: {
  vehicleId: string;
  id: string;
  /** When true (default), keep vehicle dates. When correcting, pass date fields below. */
  correctVehicleDates?: boolean;
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_licence_expiry?: string | null;
  service_due_at?: string | null;
  next_service_mileage?: string | number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to delete maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  const recordId = input.id.trim();
  if (!vehicleId || !recordId) return { ok: false, error: "Missing vehicle or record." };

  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("vehicle_maintenance_records")
    .select("id, category")
    .eq("id", recordId)
    .eq("vehicle_id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "Maintenance record not found." };

  const category = existing.category as MaintenanceCategory;

  const vehiclePatch: Record<string, unknown> = {};

  if (category === "mot") {
    vehiclePatch.mot_doc_attention_at = null;
  }
  if (category === "phv_taxi_licence") {
    vehiclePatch.phv_doc_attention_at = null;
  }

  if (input.correctVehicleDates) {
    if (category === "mot") {
      const iso = parseFlexibleDate(input.mot_expiry?.trim() ?? "");
      if (!iso) return { ok: false, error: "Enter a valid MOT expiry date." };
      vehiclePatch.mot_expiry = iso;
    }
    if (category === "tax") {
      const iso = parseFlexibleDate(input.tax_expiry?.trim() ?? "");
      if (!iso) return { ok: false, error: "Enter a valid tax expiry date." };
      vehiclePatch.tax_expiry = iso;
    }
    if (category === "phv_taxi_licence") {
      const iso = parseFlexibleDate(input.phv_licence_expiry?.trim() ?? "");
      if (!iso) return { ok: false, error: "Enter a valid PHV/Taxi licence expiry date." };
      vehiclePatch.phv_licence_expiry = iso;
    }
    if (category === "service") {
      if (input.service_due_at?.trim()) {
        const iso = parseFlexibleDate(input.service_due_at.trim());
        if (!iso) return { ok: false, error: "Service due date is invalid." };
        vehiclePatch.service_due_at = iso;
      }
      if (input.next_service_mileage != null && String(input.next_service_mileage).trim() !== "") {
        const nm = parseOptionalMiles(String(input.next_service_mileage));
        if (!nm.ok) return nm;
        vehiclePatch.next_service_mileage = nm.value;
      }
    }
  }

  const { error } = await supabase
    .from("vehicle_maintenance_records")
    .delete()
    .eq("id", recordId)
    .eq("vehicle_id", vehicleId)
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };

  if (Object.keys(vehiclePatch).length) {
    const { error: vErr } = await supabase
      .from("vehicles")
      .update(vehiclePatch)
      .eq("id", vehicleId)
      .eq("parent_company_id", companyId);
    if (vErr) return { ok: false, error: vErr.message };
  }

  revalidateMaintenance(vehicleId);
  return { ok: true };
}

export async function confirmVehicleDocAttentionAction(input: {
  vehicleId: string;
  kind: "mot" | "phv";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to confirm document updates." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return { ok: false, error: "Missing vehicle." };

  const patch =
    input.kind === "mot"
      ? { mot_doc_attention_at: null }
      : { phv_doc_attention_at: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update(patch)
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidateMaintenance(vehicleId);
  return { ok: true };
}

export type CsvImportPreviewRow = {
  line: number;
  ok: boolean;
  error?: string;
  occurred_on?: string;
  category?: MaintenanceCategory;
  description?: string;
  amount_gbp?: number;
  paid_to?: string;
  paid_by_user_id?: string | null;
  paid_by_label?: string | null;
  payment_method_id?: string;
  payment_account_id?: string | null;
  payment_reference?: string;
  odometer_miles?: number | null;
  mot_date?: string | null;
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_start_date?: string | null;
  phv_licence_expiry?: string | null;
  service_due_at?: string | null;
  next_service_mileage?: number | null;
  payment_method?: string;
  payment_account?: string;
  paid_by?: string;
};

function validateImportMatrix(opts: {
  headers: string[];
  rows: string[][];
  methods: { id: string; name: string; is_active: boolean; requires_account?: boolean | null }[];
  accounts: { id: string; name: string; is_active: boolean }[];
  staff: MaintenanceStaffOption[];
}): { ok: true; rows: CsvImportPreviewRow[]; validCount: number; invalidCount: number } | { ok: false; error: string } {
  const required = ["occurred_on", "category", "amount_gbp", "payment_method"] as const;
  const missing = required.filter((h) => !opts.headers.includes(h));
  if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(", ")}` };
  if (opts.rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `Too many rows (max ${IMPORT_MAX_ROWS}).` };
  }

  const methodByName = new Map(
    opts.methods.filter((m) => m.is_active).map((m) => [m.name.trim().toLowerCase(), m]),
  );
  const accountByName = new Map(
    opts.accounts.filter((a) => a.is_active).map((a) => [a.name.trim().toLowerCase(), a.id]),
  );
  const staffByLabel = new Map(opts.staff.map((s) => [s.label.trim().toLowerCase(), s.user_id]));
  const idx = (name: string) => opts.headers.indexOf(name);

  const rows: CsvImportPreviewRow[] = opts.rows.map((cols, i) => {
    const line = i + 2;
    const get = (h: string) => (idx(h) >= 0 ? (cols[idx(h)] ?? "").trim() : "");
    const occurred_on = parseFlexibleDate(get("occurred_on"));
    const categoryRaw = get("category").toLowerCase();
    const amount = parseAmount(get("amount_gbp"));
    const methodName = get("payment_method");
    const accountName = get("payment_account");
    const method = methodByName.get(methodName.toLowerCase());
    const miles = parseOptionalMiles(get("odometer_miles"));
    const nextMiles = parseOptionalMiles(get("next_service_mileage"));
    const paidByRaw = get("paid_by");
    const paidByUserId = paidByRaw ? staffByLabel.get(paidByRaw.toLowerCase()) ?? null : null;
    const motRaw = get("mot_date");
    const motExpiryRaw = get("mot_expiry");
    const taxExpiryRaw = get("tax_expiry");
    const phvStartRaw = get("phv_start_date");
    const phvExpiryRaw = get("phv_licence_expiry");
    const serviceDueRaw = get("service_due_at");

    if (!occurred_on) return { line, ok: false, error: "Invalid or missing occurred_on" };
    if (!isMaintenanceCategory(categoryRaw)) {
      return { line, ok: false, error: `Invalid category (use: ${MAINTENANCE_CATEGORIES.join(", ")})` };
    }
    if (!amount.ok) return { line, ok: false, error: amount.error };
    if (!method) return { line, ok: false, error: `Unknown or inactive payment_method: ${methodName || "(empty)"}` };
    if (!miles.ok) return { line, ok: false, error: miles.error };
    if (!nextMiles.ok) return { line, ok: false, error: nextMiles.error };

    const needsAccount = paymentMethodRequiresAccount({
      name: method.name,
      requires_account: normalizeRequiresAccount(method.name, method.requires_account),
    });
    let accountId: string | null = null;
    if (needsAccount) {
      accountId = accountByName.get(accountName.toLowerCase()) ?? null;
      if (!accountId) {
        return { line, ok: false, error: `Unknown or inactive payment_account: ${accountName || "(empty)"}` };
      }
    }

    let mot_date: string | null = null;
    let mot_expiry: string | null = null;
    if (categoryRaw === "mot") {
      const start = parseFlexibleDate(motRaw || occurred_on);
      if (!start) return { line, ok: false, error: "Invalid mot_date" };
      mot_date = start;
      let override: string | null = null;
      if (motExpiryRaw) {
        override = parseFlexibleDate(motExpiryRaw);
        if (!override) return { line, ok: false, error: "Invalid mot_expiry" };
      }
      mot_expiry = expiryFromStartOrOverride(start, override);
      if (!mot_expiry) return { line, ok: false, error: "Could not calculate mot_expiry" };
    } else {
      if (motRaw) {
        const md = parseFlexibleDate(motRaw);
        if (!md) return { line, ok: false, error: "Invalid mot_date" };
        mot_date = md;
      }
      if (motExpiryRaw) {
        const md = parseFlexibleDate(motExpiryRaw);
        if (!md) return { line, ok: false, error: "Invalid mot_expiry" };
        mot_expiry = md;
      }
    }

    let tax_expiry: string | null = null;
    if (categoryRaw === "tax") {
      if (!taxExpiryRaw) return { line, ok: false, error: "tax_expiry is required for tax rows" };
      const td = parseFlexibleDate(taxExpiryRaw);
      if (!td) return { line, ok: false, error: "Invalid tax_expiry" };
      tax_expiry = td;
    } else if (taxExpiryRaw) {
      const td = parseFlexibleDate(taxExpiryRaw);
      if (!td) return { line, ok: false, error: "Invalid tax_expiry" };
      tax_expiry = td;
    }

    let phv_start_date: string | null = null;
    let phv_licence_expiry: string | null = null;
    if (categoryRaw === "phv_taxi_licence") {
      const start = parseFlexibleDate(phvStartRaw || occurred_on);
      if (!start) return { line, ok: false, error: "Invalid phv_start_date" };
      phv_start_date = start;
      let override: string | null = null;
      if (phvExpiryRaw) {
        override = parseFlexibleDate(phvExpiryRaw);
        if (!override) return { line, ok: false, error: "Invalid phv_licence_expiry" };
      }
      phv_licence_expiry = expiryFromStartOrOverride(start, override);
      if (!phv_licence_expiry) return { line, ok: false, error: "Could not calculate phv_licence_expiry" };
    } else {
      if (phvStartRaw) {
        const start = parseFlexibleDate(phvStartRaw);
        if (!start) return { line, ok: false, error: "Invalid phv_start_date" };
        phv_start_date = start;
      }
      if (phvExpiryRaw) {
        const pd = parseFlexibleDate(phvExpiryRaw);
        if (!pd) return { line, ok: false, error: "Invalid phv_licence_expiry" };
        phv_licence_expiry = pd;
      }
    }

    let service_due_at: string | null = null;
    if (serviceDueRaw) {
      service_due_at = parseFlexibleDate(serviceDueRaw);
      if (!service_due_at) return { line, ok: false, error: "Invalid service_due_at" };
    }

    return {
      line,
      ok: true,
      occurred_on,
      category: categoryRaw,
      description: get("description"),
      amount_gbp: amount.value,
      paid_to: get("paid_to"),
      paid_by_user_id: paidByUserId,
      paid_by_label: paidByUserId ? null : paidByRaw || null,
      payment_method_id: method.id,
      payment_account_id: accountId,
      payment_reference: get("payment_reference"),
      odometer_miles: miles.value,
      mot_date,
      mot_expiry,
      tax_expiry,
      phv_start_date,
      phv_licence_expiry,
      service_due_at,
      next_service_mileage: nextMiles.value,
      payment_method: methodName,
      payment_account: accountName,
      paid_by: paidByRaw,
    };
  });

  const validCount = rows.filter((r) => r.ok).length;
  return { ok: true, rows, validCount, invalidCount: rows.length - validCount };
}

export async function previewMaintenanceImportAction(input: {
  vehicleId: string;
  /** Base64 file contents */
  fileBase64: string;
  fileName: string;
}): Promise<
  | { ok: true; rows: CsvImportPreviewRow[]; validCount: number; invalidCount: number }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to import maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", input.vehicleId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const [{ data: methods }, { data: accounts }, staff] = await Promise.all([
    supabase
      .from("company_payment_methods")
      .select("id, name, is_active, requires_account")
      .eq("parent_company_id", companyId),
    supabase
      .from("company_payment_accounts")
      .select("id, name, is_active")
      .eq("parent_company_id", companyId),
    loadStaffOptions(companyId),
  ]);

  const buf = Buffer.from(input.fileBase64, "base64");
  const lower = input.fileName.toLowerCase();
  let headers: string[];
  let rows: string[][];

  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const parsed = await parseMaintenanceExcel(buf);
    headers = parsed.headers;
    rows = parsed.rows;
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const parsed = parseCsv(buf.toString("utf8"));
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    return { ok: false, error: "Upload an Excel (.xlsx) or CSV file." };
  }

  if (!headers.length) return { ok: false, error: "File is empty." };

  return validateImportMatrix({
    headers,
    rows,
    methods: methods ?? [],
    accounts: accounts ?? [],
    staff,
  });
}

/** @deprecated use previewMaintenanceImportAction */
export async function previewMaintenanceCsvAction(input: {
  vehicleId: string;
  csvText: string;
}): Promise<
  | { ok: true; rows: CsvImportPreviewRow[]; validCount: number; invalidCount: number }
  | { ok: false; error: string }
> {
  const b64 = Buffer.from(input.csvText, "utf8").toString("base64");
  return previewMaintenanceImportAction({
    vehicleId: input.vehicleId,
    fileBase64: b64,
    fileName: "import.csv",
  });
}

export async function importMaintenanceCsvAction(input: {
  vehicleId: string;
  rows: CsvImportPreviewRow[];
}): Promise<{ ok: true; imported: number; skipped: number } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to import maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const vehicleId = input.vehicleId.trim();
  const valid = input.rows.filter((r) => r.ok);
  if (!valid.length) return { ok: false, error: "No valid rows to import." };

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, subcompany_id")
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const user = await getSessionUser();
  const insertRows = valid.map((r) => ({
    vehicle_id: vehicleId,
    parent_company_id: companyId,
    subcompany_id: vehicle.subcompany_id,
    occurred_on: r.occurred_on!,
    category: r.category!,
    description: r.description ?? "",
    amount_gbp: r.amount_gbp!,
    odometer_miles: r.odometer_miles ?? null,
    paid_to: r.paid_to ?? "",
    paid_by_user_id: r.paid_by_user_id ?? null,
    paid_by_label: r.paid_by_label ?? null,
    payment_method_id: r.payment_method_id!,
    payment_account_id: r.payment_account_id ?? null,
    payment_reference: r.payment_reference ?? "",
    source: "excel" as const,
    created_by: user?.id ?? null,
  }));

  const { error } = await supabase.from("vehicle_maintenance_records").insert(insertRows);
  if (error) return { ok: false, error: error.message };

  // Apply vehicle side-effects in chronological order so latest MOT/service wins
  const ordered = [...valid].sort((a, b) => (a.occurred_on! < b.occurred_on! ? -1 : 1));
  for (const r of ordered) {
    const side = await applyVehicleSideEffects(supabase, companyId, vehicleId, {
      category: r.category!,
      occurred_on: r.occurred_on!,
      odometer_miles: r.odometer_miles ?? null,
      mot_date: r.mot_date,
      mot_expiry: r.mot_expiry,
      tax_expiry: r.tax_expiry,
      phv_start_date: r.phv_start_date,
      phv_licence_expiry: r.phv_licence_expiry,
      service_due_at: r.service_due_at,
      next_service_mileage: r.next_service_mileage,
    });
    if (!side.ok) return side;
  }

  revalidateMaintenance(vehicleId);
  return {
    ok: true,
    imported: insertRows.length,
    skipped: input.rows.length - insertRows.length,
  };
}

export async function getMaintenanceExcelTemplateAction(
  vehicleId: string,
): Promise<{ ok: true; fileBase64: string; fileName: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to download the template." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("vrm")
    .eq("id", vehicleId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const seeded = await ensureDefaultPaymentMethodsAction();
  if (!seeded.ok) return seeded;

  const [{ data: accounts }, staff] = await Promise.all([
    supabase
      .from("company_payment_accounts")
      .select("name, is_active")
      .eq("parent_company_id", companyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    loadStaffOptions(companyId),
  ]);

  const buf = await buildMaintenanceExcelTemplate({
    methodNames: seeded.methods.filter((m) => m.is_active).map((m) => m.name),
    accountNames: (accounts ?? []).map((a) => a.name),
    staffLabels: staff.map((s) => s.label),
  });

  return {
    ok: true,
    fileBase64: buf.toString("base64"),
    fileName: `maintenance-template-${vehicle.vrm}.xlsx`,
  };
}

/** @deprecated */
export async function getMaintenanceCsvTemplateAction(): Promise<{ ok: true; csv: string }> {
  await requireRentalCompanyArea();
  return {
    ok: true,
    csv: MAINTENANCE_IMPORT_HEADERS.join(",") + "\n",
  };
}
