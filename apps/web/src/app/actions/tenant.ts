"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, requireProfile } from "@/lib/auth/profile";

export type ActionResult = { error?: string; ok?: boolean };

export async function createRentalCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Company name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("rental_company").insert({
    name,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    contact_number: String(formData.get("contact_number") ?? "").trim() || null,
    company_reg_no: String(formData.get("company_reg_no") ?? "").trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/companies");
  return { ok: true };
}

export async function createSubcompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, profile } = await requireProfile();

  const companyId = String(formData.get("company_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!companyId || !name) return { error: "Company and name are required." };

  const supabase = await createClient();

  if (profile.user_type === "platform_admin") {
    const { error } = await supabase.from("subcompany").insert({
      company_id: companyId,
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      contact_number: String(formData.get("contact_number") ?? "").trim() || null,
      company_no: String(formData.get("company_no") ?? "").trim() || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${companyId}`);
    return { ok: true };
  }

  if (profile.user_type !== "company_staff") {
    return { error: "Not allowed." };
  }

  const { data: staffRows, error: staffErr } = await supabase
    .from("company_staff")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  if (staffErr || !staffRows?.length) {
    return { error: "You do not have access to this company." };
  }

  const { error } = await supabase.from("subcompany").insert({
    company_id: companyId,
    name,
    address: String(formData.get("address") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    contact_number: String(formData.get("contact_number") ?? "").trim() || null,
    company_no: String(formData.get("company_no") ?? "").trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/company/subcompanies");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function adminAddStaffAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const companyId = String(formData.get("company_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!companyId || !email) {
    return { error: "Company and staff email are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_company_staff", {
    p_company_id: companyId,
    p_email: email,
    p_display_name: displayName,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true };
}
