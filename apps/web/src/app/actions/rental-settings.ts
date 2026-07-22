"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageSettings } from "@/lib/auth/rental-permissions";
import {
  clampNotifyDays,
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { createClient } from "@/lib/supabase/server";

export async function loadCompanyNotificationSettingsAction(): Promise<
  { ok: true; settings: CompanyNotificationSettings; canManage: boolean } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before")
    .eq("id", companyId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    canManage: canManageSettings(profile),
    settings: parseCompanyNotificationSettings(data ?? undefined),
  };
}

export async function saveCompanyNotificationSettingsAction(input: {
  notify_mot_days_before: number;
  notify_tax_days_before: number;
  notify_phv_licence_days_before: number;
  notify_contract_expiry_days_before: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canManageSettings(profile)) {
    return { ok: false, error: "You do not have permission to change settings." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const patch = {
    notify_mot_days_before: clampNotifyDays(input.notify_mot_days_before),
    notify_tax_days_before: clampNotifyDays(input.notify_tax_days_before),
    notify_phv_licence_days_before: clampNotifyDays(input.notify_phv_licence_days_before),
    notify_contract_expiry_days_before: clampNotifyDays(input.notify_contract_expiry_days_before),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rental/settings");
  revalidatePath("/rental/vehicles");
  return { ok: true };
}
