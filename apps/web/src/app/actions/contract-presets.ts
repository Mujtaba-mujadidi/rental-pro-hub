"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PricingPresetRow = {
  id: string;
  name: string;
  pricing_model_type: string;
  billing_frequency: string | null;
  currency: string;
  is_active: boolean;
  description: string | null;
  internal_note: string | null;
  parameters: Record<string, unknown> | null;
};

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function listPricingPresetsForRegisterAction(): Promise<
  { ok: true; presets: { id: string; name: string; pricing_model_type: string }[] } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("contract_pricing_presets")
      .select("id, name, pricing_model_type")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, presets: (data ?? []) as { id: string; name: string; pricing_model_type: string }[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load presets." };
  }
}

export async function listPricingPresetsAdminAction(): Promise<
  { ok: true; rows: PricingPresetRow[] } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("contract_pricing_presets")
      .select("id, name, pricing_model_type, billing_frequency, currency, is_active, description, internal_note, parameters")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as PricingPresetRow[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load presets." };
  }
}

export async function savePricingPresetAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const id = nullIfEmpty(formData.get("id"));
    const name = nullIfEmpty(formData.get("name"));
    if (!name) return { ok: false, error: "Name is required." };
    const pricing_model_type = nullIfEmpty(formData.get("pricing_model_type")) ?? "fixed_monthly";
    const billing_frequency = nullIfEmpty(formData.get("billing_frequency"));
    const currency = nullIfEmpty(formData.get("currency")) ?? "GBP";
    const description = nullIfEmpty(formData.get("description"));
    const internal_note = nullIfEmpty(formData.get("internal_note"));
    const is_active = formData.has("is_active");
    let parametersPatch: Record<string, unknown> | undefined;
    const paramsRaw = nullIfEmpty(formData.get("parameters_json"));
    if (paramsRaw) {
      try {
        parametersPatch = JSON.parse(paramsRaw) as Record<string, unknown>;
      } catch {
        return { ok: false, error: "Parameters must be valid JSON." };
      }
    } else {
      const monthly = nullIfEmpty(formData.get("monthly_amount"));
      if (monthly) {
        const n = Number.parseFloat(monthly);
        if (Number.isFinite(n)) parametersPatch = { monthly_amount: n };
      }
    }

    const base = {
      name,
      pricing_model_type,
      billing_frequency,
      currency,
      description,
      internal_note,
      is_active,
    };

    if (id) {
      const row =
        parametersPatch !== undefined ? { ...base, parameters: parametersPatch } : base;
      const { error } = await admin.from("contract_pricing_presets").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin.from("contract_pricing_presets").insert({
        ...base,
        parameters: parametersPatch ?? {},
      });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/super-admin/settings/contract-presets");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
