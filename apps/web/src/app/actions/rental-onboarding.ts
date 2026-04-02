"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

function canManageOnboarding(profile: {
  membership_role: string | null;
  company_role: "admin" | "staff" | null;
}) {
  return profile.membership_role === "owner" || profile.membership_role === "admin" || profile.company_role === "admin";
}

export async function saveRentalOnboardingStepAction(stepIndex: number): Promise<OnboardingActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!canManageOnboarding(profile)) {
    return { ok: false, error: "You do not have permission to update onboarding." };
  }
  if (!Number.isFinite(stepIndex) || stepIndex < 0 || stepIndex > 50) {
    return { ok: false, error: "Invalid step." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ rental_onboarding_step: stepIndex })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rental/onboarding");
  return { ok: true };
}

export async function completeRentalOnboardingAction(): Promise<OnboardingActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!canManageOnboarding(profile)) {
    return { ok: false, error: "You do not have permission to complete onboarding." };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      rental_onboarding_completed_at: now,
      rental_onboarding_step: 99,
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("profiles").update({ company_id: companyId }).eq("id", profile.id);

  revalidatePath("/rental");
  revalidatePath("/rental/onboarding");
  return { ok: true };
}

export async function uploadParentCompanyLogoAction(formData: FormData): Promise<OnboardingActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!canManageOnboarding(profile)) {
    return { ok: false, error: "You do not have permission to upload a logo." };
  }

  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) {
    return { ok: false, error: "Choose a logo file." };
  }
  if (!LOGO_TYPES.has(logo.type)) {
    return { ok: false, error: "Logo must be PNG, JPEG, or WebP." };
  }
  if (logo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo must be 2MB or smaller." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const ext = extForMime(logo.type);
  const path = `${companyId}/logo.${ext}`;
  const buf = Buffer.from(await logo.arrayBuffer());
  const { error: upErr } = await admin.storage.from("company-logos").upload(path, buf, {
    contentType: logo.type,
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: dbErr } = await admin.from("companies").update({ logo_storage_path: path }).eq("id", companyId);
  if (dbErr) return { ok: false, error: dbErr.message };

  revalidatePath("/rental/onboarding");
  return { ok: true };
}

export async function updatePrimarySubcompanyOnboardingAction(formData: FormData): Promise<OnboardingActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!canManageOnboarding(profile)) {
    return { ok: false, error: "You do not have permission to update the primary unit." };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const tradingName = String(formData.get("trading_name") ?? "").trim();
  if (!tradingName) return { ok: false, error: "Trading / operational name is required." };

  const supabase = await createClient();
  const { data: primary, error: pErr } = await supabase
    .from("subcompanies")
    .select("id")
    .eq("parent_company_id", companyId)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!primary?.id) return { ok: false, error: "Primary operational unit not found." };

  const { error: uErr } = await supabase
    .from("subcompanies")
    .update({
      name: tradingName,
      display_name: displayName || null,
    })
    .eq("id", primary.id);
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath("/rental/onboarding");
  return { ok: true };
}

export async function updateParentCompanyProfileFieldsAction(formData: FormData): Promise<OnboardingActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!canManageOnboarding(profile)) {
    return { ok: false, error: "You do not have permission to update company details." };
  }

  const entityType = String(formData.get("entity_type") ?? "").trim();
  const tradingName = String(formData.get("trading_name") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      entity_type: entityType || null,
      trading_name: tradingName || null,
      billing_email: billingEmail || null,
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rental/onboarding");
  return { ok: true };
}
