"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadMaintenance, canWriteMaintenance } from "@/lib/auth/rental-permissions";
import { parseCsv, toCsv } from "@/lib/csv/parse-csv";
import {
  isMaintenanceCategory,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CSV_HEADERS,
  type MaintenanceCategory,
  type MaintenanceRecordRow,
  type PaymentAccountRow,
  type PaymentMethodRow,
} from "@/lib/fleet/maintenance";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseUkDate } from "@/lib/validation/driver-signup";
import { ensureDefaultPaymentMethodsAction } from "@/app/actions/rental-payment-settings";

const CSV_MAX_ROWS = 500;

function revalidateMaintenance(vehicleId: string) {
  revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidatePath(`/rental/vehicles/${vehicleId}/maintenance`);
  revalidatePath(`/rental/vehicles/${vehicleId}/details`);
}

function parseOptionalMiles(raw: string | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Odometer must be a non-negative whole number." };
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

export type MaintenanceStaffOption = { user_id: string; label: string };

export type VehicleMaintenancePageData = {
  records: MaintenanceRecordRow[];
  totalAmount: number;
  yearTotalAmount: number;
  methods: PaymentMethodRow[];
  accounts: PaymentAccountRow[];
  staff: MaintenanceStaffOption[];
  canWrite: boolean;
  vehicle: { id: string; vrm: string; make: string; model: string; subcompany_id: string };
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
    .select("id, vrm, make, model, subcompany_id")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const [{ data: rows, error: rErr }, seededMethods, { data: accounts, error: aErr }, staff] = await Promise.all([
    supabase
      .from("vehicle_maintenance_records")
      .select(
        "id, parent_company_id, subcompany_id, vehicle_id, occurred_on, category, description, amount_gbp, odometer_miles, paid_to, paid_by_user_id, paid_by_label, payment_method_id, payment_account_id, source, created_by, created_at, updated_at",
      )
      .eq("vehicle_id", id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    ensureDefaultPaymentMethodsAction(),
    supabase
      .from("company_payment_accounts")
      .select("id, parent_company_id, name, notes, is_active, sort_order, created_at")
      .eq("parent_company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    loadStaffOptions(companyId),
  ]);

  if (rErr) return { ok: false, error: rErr.message };
  if (!seededMethods.ok) return seededMethods;
  if (aErr) return { ok: false, error: aErr.message };

  const methods = seededMethods.methods;

  const methodName = new Map((methods ?? []).map((m) => [m.id, m.name]));
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const staffLabel = new Map(staff.map((s) => [s.user_id, s.label]));

  const records: MaintenanceRecordRow[] = (rows ?? []).map((r) => {
    const amount = typeof r.amount_gbp === "string" ? Number.parseFloat(r.amount_gbp) : Number(r.amount_gbp);
    const paidByDisplay =
      (r.paid_by_user_id ? staffLabel.get(r.paid_by_user_id) : null) ||
      r.paid_by_label?.trim() ||
      null;
    return {
      ...(r as Omit<MaintenanceRecordRow, "amount_gbp" | "category">),
      category: r.category as MaintenanceCategory,
      amount_gbp: Number.isFinite(amount) ? amount : 0,
      payment_method_name: methodName.get(r.payment_method_id) ?? null,
      payment_account_name: accountName.get(r.payment_account_id) ?? null,
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
      methods: methods as PaymentMethodRow[],
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
  payment_account_id: string;
  update_service_fields?: boolean;
  service_due_at?: string | null;
  next_service_mileage?: string | number | null;
};

export async function saveMaintenanceRecordAction(
  input: SaveMaintenanceInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
  const miles = parseOptionalMiles(
    input.odometer_miles == null ? "" : String(input.odometer_miles),
  );
  if (!miles.ok) return miles;
  if (!input.payment_method_id?.trim()) return { ok: false, error: "Select a payment method." };
  if (!input.payment_account_id?.trim()) return { ok: false, error: "Select a payment account." };

  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("id, subcompany_id")
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

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
    paid_by_label: input.paid_by_user_id?.trim()
      ? null
      : input.paid_by_label?.trim() || null,
    payment_method_id: input.payment_method_id.trim(),
    payment_account_id: input.payment_account_id.trim(),
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
      })
      .eq("id", recordId)
      .eq("vehicle_id", vehicleId)
      .eq("parent_company_id", companyId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("vehicle_maintenance_records")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    recordId = data.id;
  }

  if (input.update_service_fields && input.category === "service") {
    const vehiclePatch: Record<string, unknown> = {};
    if (input.service_due_at !== undefined) {
      const due = input.service_due_at?.trim();
      if (due) {
        const iso = parseFlexibleDate(due);
        if (!iso) return { ok: false, error: "Service due date is invalid." };
        vehiclePatch.service_due_at = iso;
      } else {
        vehiclePatch.service_due_at = null;
      }
    }
    if (input.next_service_mileage !== undefined) {
      const nm = parseOptionalMiles(
        input.next_service_mileage == null ? "" : String(input.next_service_mileage),
      );
      if (!nm.ok) return nm;
      vehiclePatch.next_service_mileage = nm.value;
    }
    if (miles.value != null) vehiclePatch.current_mileage = miles.value;
    if (Object.keys(vehiclePatch).length) {
      const { error: upErr } = await supabase
        .from("vehicles")
        .update(vehiclePatch)
        .eq("id", vehicleId)
        .eq("parent_company_id", companyId);
      if (upErr) return { ok: false, error: upErr.message };
    }
  }

  revalidateMaintenance(vehicleId);
  return { ok: true, id: recordId };
}

export async function deleteMaintenanceRecordAction(input: {
  vehicleId: string;
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteMaintenance(profile)) {
    return { ok: false, error: "You do not have permission to delete maintenance." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_maintenance_records")
    .delete()
    .eq("id", input.id.trim())
    .eq("vehicle_id", input.vehicleId.trim())
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidateMaintenance(input.vehicleId.trim());
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
  payment_account_id?: string;
  odometer_miles?: number | null;
  payment_method?: string;
  payment_account?: string;
  paid_by?: string;
};

export async function previewMaintenanceCsvAction(input: {
  vehicleId: string;
  csvText: string;
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

  const parsed = parseCsv(input.csvText);
  if (!parsed.headers.length) return { ok: false, error: "CSV is empty." };

  const missing = MAINTENANCE_CSV_HEADERS.filter((h) => !parsed.headers.includes(h));
  if (missing.length) {
    return { ok: false, error: `Missing CSV columns: ${missing.join(", ")}` };
  }
  if (parsed.rows.length > CSV_MAX_ROWS) {
    return { ok: false, error: `CSV has too many rows (max ${CSV_MAX_ROWS}).` };
  }

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
      .select("id, name, is_active")
      .eq("parent_company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("company_payment_accounts")
      .select("id, name, is_active")
      .eq("parent_company_id", companyId)
      .eq("is_active", true),
    loadStaffOptions(companyId),
  ]);

  const methodByName = new Map((methods ?? []).map((m) => [m.name.trim().toLowerCase(), m.id]));
  const accountByName = new Map((accounts ?? []).map((a) => [a.name.trim().toLowerCase(), a.id]));
  const staffByLabel = new Map<string, string>();
  for (const s of staff) {
    staffByLabel.set(s.label.trim().toLowerCase(), s.user_id);
    // also allow matching by raw email-ish labels already in label
  }

  const idx = (name: string) => parsed.headers.indexOf(name);

  const rows: CsvImportPreviewRow[] = parsed.rows.map((cols, i) => {
    const line = i + 2;
    const get = (h: (typeof MAINTENANCE_CSV_HEADERS)[number]) => (cols[idx(h)] ?? "").trim();
    const occurred_on = parseFlexibleDate(get("occurred_on"));
    const categoryRaw = get("category").toLowerCase();
    const amount = parseAmount(get("amount_gbp"));
    const methodName = get("payment_method");
    const accountName = get("payment_account");
    const methodId = methodByName.get(methodName.toLowerCase());
    const accountId = accountByName.get(accountName.toLowerCase());
    const miles = parseOptionalMiles(get("odometer_miles"));
    const paidByRaw = get("paid_by");
    const paidByUserId = paidByRaw ? staffByLabel.get(paidByRaw.toLowerCase()) ?? null : null;

    if (!occurred_on) {
      return { line, ok: false, error: "Invalid or missing occurred_on" };
    }
    if (!isMaintenanceCategory(categoryRaw)) {
      return {
        line,
        ok: false,
        error: `Invalid category (use: ${MAINTENANCE_CATEGORIES.join(", ")})`,
      };
    }
    if (!amount.ok) return { line, ok: false, error: amount.error };
    if (!methodId) return { line, ok: false, error: `Unknown or inactive payment_method: ${methodName || "(empty)"}` };
    if (!accountId) return { line, ok: false, error: `Unknown or inactive payment_account: ${accountName || "(empty)"}` };
    if (!miles.ok) return { line, ok: false, error: miles.error };

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
      payment_method_id: methodId,
      payment_account_id: accountId,
      odometer_miles: miles.value,
      payment_method: methodName,
      payment_account: accountName,
      paid_by: paidByRaw,
    };
  });

  const validCount = rows.filter((r) => r.ok).length;
  return {
    ok: true,
    rows,
    validCount,
    invalidCount: rows.length - validCount,
  };
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
    payment_account_id: r.payment_account_id!,
    source: "csv" as const,
    created_by: user?.id ?? null,
  }));

  const { error } = await supabase.from("vehicle_maintenance_records").insert(insertRows);
  if (error) return { ok: false, error: error.message };

  revalidateMaintenance(vehicleId);
  return {
    ok: true,
    imported: insertRows.length,
    skipped: input.rows.length - insertRows.length,
  };
}

export async function getMaintenanceCsvTemplateAction(): Promise<{ ok: true; csv: string }> {
  await requireRentalCompanyArea();
  const example = [
    ["2026-07-01", "service", "Annual service", "245.00", "Kwik Fit", "Alice Ops", "Card", "Barclays Business", "45210"],
    ["18/06/2026", "tyres", "Two front tyres", "180.50", "National Tyres", "", "Cash", "Petty cash", ""],
  ];
  return {
    ok: true,
    csv: toCsv([...MAINTENANCE_CSV_HEADERS], example),
  };
}
