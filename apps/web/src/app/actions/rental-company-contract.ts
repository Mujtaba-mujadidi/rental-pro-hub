"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea, requireSuperAdmin } from "@/lib/auth/profile";
import { notifyCompanyFinanceRoles, notifySuperAdmins } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RequestContractChangeResult = { ok: true } | { ok: false; error: string };
export type ApplyContractChangeResult = { ok: true } | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function requestRentalCompanyContractChangeAction(
  formData: FormData,
): Promise<RequestContractChangeResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "Missing rental company context." };

  const mr = profile.membership_role;
  if (mr !== "owner" && mr !== "admin") {
    return { ok: false, error: "Only company owners and admins can request legal or contract changes." };
  }

  const name = nullIfEmpty(formData.get("name"));
  const firstName = nullIfEmpty(formData.get("primary_contact_first_name"));
  const lastName = nullIfEmpty(formData.get("primary_contact_last_name"));
  const contactEmail = nullIfEmpty(formData.get("primary_contact_email"));
  const contactPhone = nullIfEmpty(formData.get("primary_contact_phone"));
  const dobRaw = nullIfEmpty(formData.get("primary_contact_dob"));

  if (!name) return { ok: false, error: "Company name is required." };
  if (!firstName) return { ok: false, error: "Primary contact first name is required." };
  if (!lastName) return { ok: false, error: "Primary contact last name is required." };
  if (!contactEmail) return { ok: false, error: "Primary contact email is required." };
  if (!contactPhone) return { ok: false, error: "Primary contact phone is required." };
  if (!dobRaw) return { ok: false, error: "Primary contact date of birth is required." };

  let dob: string;
  try {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date of birth." };
    dob = d.toISOString().slice(0, 10);
  } catch {
    return { ok: false, error: "Invalid date of birth." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: pending } = await admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", parentCompanyId)
    .eq("status", "pending_signature")
    .neq("review_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending?.id) {
    return { ok: false, error: "A contract change is already in progress." };
  }

  const transitionRaw = nullIfEmpty(formData.get("transition_type")) ?? "detail_change";
  const transition_type = transitionRaw === "new_legal_entity" ? "new_legal_entity" : "detail_change";

  const postcodeRaw = nullIfEmpty(formData.get("registered_postcode"));
  const registeredPostcode = postcodeRaw ? postcodeRaw.trim().toUpperCase().replace(/\s+/g, "") : null;

  const { error: insertErr } = await admin.from("company_contract_change_requests").insert({
    parent_company_id: parentCompanyId,
    requested_by: profile.id,
    status: "pending_signature",
    review_status: "pending_review",
    transition_type,
    proposed_name: name,
    proposed_legal_name: nullIfEmpty(formData.get("legal_name")),
    proposed_company_number: nullIfEmpty(formData.get("company_number")),
    proposed_registered_address_line1: nullIfEmpty(formData.get("registered_address_line1")),
    proposed_registered_address_line2: nullIfEmpty(formData.get("registered_address_line2")),
    proposed_registered_town: nullIfEmpty(formData.get("registered_town")),
    proposed_registered_county: nullIfEmpty(formData.get("registered_county")),
    proposed_registered_postcode: registeredPostcode,
    proposed_country: nullIfEmpty(formData.get("country")) ?? "GB",
    proposed_primary_contact_first_name: firstName,
    proposed_primary_contact_last_name: lastName,
    proposed_primary_contact_dob: dob,
    proposed_primary_contact_phone: contactPhone,
    proposed_primary_contact_email: contactEmail,
    proposed_notes: nullIfEmpty(formData.get("notes")),
    signatory_name: nullIfEmpty(formData.get("signatory_name")),
    signatory_email: nullIfEmpty(formData.get("signatory_email")),
    signatory_title: nullIfEmpty(formData.get("signatory_title")),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  await notifySuperAdmins(admin, "contract_change_requested", {
    parent_company_id: parentCompanyId,
    transition_type,
    requested_by: profile.id,
  });

  const { error: upErr } = await admin
    .from("companies")
    .update({ contract_status: "pending_renewal" })
    .eq("id", parentCompanyId);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/rental");
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

export async function applySignedCompanyContractChangeAction(
  changeId: string,
): Promise<ApplyContractChangeResult> {
  const { user } = await requireSuperAdmin();
  const trimmed = changeId?.trim();
  if (!trimmed) return { ok: false, error: "Missing change request." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: chRow } = await admin
    .from("company_contract_change_requests")
    .select("parent_company_id")
    .eq("id", trimmed)
    .maybeSingle();

  const { error } = await admin.rpc("apply_company_contract_change", {
    p_change_id: trimmed,
    p_signed_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  if (chRow?.parent_company_id) {
    await notifyCompanyFinanceRoles(admin, chRow.parent_company_id as string, "legal_change_applied", {
      change_id: trimmed,
    });
  }

  revalidatePath("/rental");
  revalidatePath("/super-admin/companies");
  return { ok: true };
}
