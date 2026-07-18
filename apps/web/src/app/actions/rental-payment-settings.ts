"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageSettings } from "@/lib/auth/rental-permissions";
import {
  DEFAULT_PAYMENT_METHOD_NAMES,
  type PaymentAccountRow,
  type PaymentMethodRow,
} from "@/lib/fleet/maintenance";
import { createClient } from "@/lib/supabase/server";

function revalidatePaymentSettings() {
  revalidatePath("/rental/settings");
  revalidatePath("/rental/vehicles");
}

async function requireCompanyWritableAdmin() {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return { ok: false as const, error: writable.error };
  if (!canManageSettings(profile)) {
    return { ok: false as const, error: "You do not have permission to change payment settings." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false as const, error: "No active company." };
  return { ok: true as const, companyId, profile };
}

/** Ensure default payment methods exist (Cash, Card, Bank transfer). Idempotent. */
export async function ensureDefaultPaymentMethodsAction(): Promise<
  { ok: true; methods: PaymentMethodRow[] } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: existing, error: listErr } = await supabase
    .from("company_payment_methods")
    .select("id, parent_company_id, name, is_active, sort_order, created_at")
    .eq("parent_company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (listErr) return { ok: false, error: listErr.message };

  if ((existing ?? []).length === 0 && canManageSettings(profile)) {
    const writable = await assertRentalCompanyWritable(profile);
    if (writable.ok) {
      const rows = DEFAULT_PAYMENT_METHOD_NAMES.map((name, i) => ({
        parent_company_id: companyId,
        name,
        is_active: true,
        sort_order: i,
      }));
      const { error: insErr } = await supabase.from("company_payment_methods").insert(rows);
      if (insErr) return { ok: false, error: insErr.message };
      const { data: seeded, error: reloadErr } = await supabase
        .from("company_payment_methods")
        .select("id, parent_company_id, name, is_active, sort_order, created_at")
        .eq("parent_company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (reloadErr) return { ok: false, error: reloadErr.message };
      return { ok: true, methods: (seeded ?? []) as PaymentMethodRow[] };
    }
  }

  return { ok: true, methods: (existing ?? []) as PaymentMethodRow[] };
}

export async function loadPaymentSettingsAction(): Promise<
  | {
      ok: true;
      methods: PaymentMethodRow[];
      accounts: PaymentAccountRow[];
      canManage: boolean;
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const seeded = await ensureDefaultPaymentMethodsAction();
  if (!seeded.ok) return seeded;

  const supabase = await createClient();
  const { data: accounts, error: aErr } = await supabase
    .from("company_payment_accounts")
    .select("id, parent_company_id, name, notes, is_active, sort_order, created_at")
    .eq("parent_company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (aErr) return { ok: false, error: aErr.message };

  return {
    ok: true,
    methods: seeded.methods,
    accounts: (accounts ?? []) as PaymentAccountRow[],
    canManage: canManageSettings(profile),
  };
}

export async function createPaymentMethodAction(input: {
  name: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await requireCompanyWritableAdmin();
  if (!gate.ok) return gate;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("company_payment_methods")
    .select("sort_order")
    .eq("parent_company_id", gate.companyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("company_payment_methods")
    .insert({
      parent_company_id: gate.companyId,
      name,
      is_active: true,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A payment method with that name already exists." };
    return { ok: false, error: error.message };
  }
  revalidatePaymentSettings();
  return { ok: true, id: data.id };
}

export async function updatePaymentMethodAction(input: {
  id: string;
  name?: string;
  is_active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireCompanyWritableAdmin();
  if (!gate.ok) return gate;

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };
    patch.name = name;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to update." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_payment_methods")
    .update(patch)
    .eq("id", input.id)
    .eq("parent_company_id", gate.companyId);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A payment method with that name already exists." };
    return { ok: false, error: error.message };
  }
  revalidatePaymentSettings();
  return { ok: true };
}

export async function createPaymentAccountAction(input: {
  name: string;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await requireCompanyWritableAdmin();
  if (!gate.ok) return gate;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("company_payment_accounts")
    .select("sort_order")
    .eq("parent_company_id", gate.companyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("company_payment_accounts")
    .insert({
      parent_company_id: gate.companyId,
      name,
      notes: input.notes?.trim() || null,
      is_active: true,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A payment account with that name already exists." };
    return { ok: false, error: error.message };
  }
  revalidatePaymentSettings();
  return { ok: true, id: data.id };
}

export async function updatePaymentAccountAction(input: {
  id: string;
  name?: string;
  notes?: string | null;
  is_active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireCompanyWritableAdmin();
  if (!gate.ok) return gate;

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };
    patch.name = name;
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to update." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_payment_accounts")
    .update(patch)
    .eq("id", input.id)
    .eq("parent_company_id", gate.companyId);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A payment account with that name already exists." };
    return { ok: false, error: error.message };
  }
  revalidatePaymentSettings();
  return { ok: true };
}
