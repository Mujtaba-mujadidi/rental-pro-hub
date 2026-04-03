"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createInitialCompanyContract, type InitialContractCommercial } from "@/app/actions/admin-companies";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function completeNewLegalEntityTransitionAction(
  changeId: string,
): Promise<{ ok: true; newCompanyId?: string } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const id = changeId?.trim();
  if (!id) return { ok: false, error: "Missing change request." };

  const admin = createSupabaseAdminClient();
  const { data: req, error: rErr } = await admin
    .from("company_contract_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !req) return { ok: false, error: rErr?.message ?? "Request not found." };
  if (req.transition_type !== "new_legal_entity") {
    return { ok: false, error: "This action applies only to new legal entity requests." };
  }
  if (req.status !== "pending_signature") {
    return { ok: false, error: "Request is not pending completion." };
  }
  if (req.review_status !== "awaiting_signature" && req.review_status !== "approved") {
    return { ok: false, error: "Request must be approved before completing the new entity." };
  }

  const oldParentId = req.parent_company_id as string;
  const postcode = req.proposed_registered_postcode as string | null;

  const { data: newCompany, error: cErr } = await admin
    .from("companies")
    .insert({
      name: req.proposed_name as string,
      legal_name: req.proposed_legal_name,
      company_number: req.proposed_company_number,
      registered_address_line1: req.proposed_registered_address_line1,
      registered_address_line2: req.proposed_registered_address_line2,
      registered_town: req.proposed_registered_town,
      registered_county: req.proposed_registered_county,
      registered_postcode: postcode,
      country: req.proposed_country ?? "GB",
      primary_contact_first_name: req.proposed_primary_contact_first_name,
      primary_contact_last_name: req.proposed_primary_contact_last_name,
      primary_contact_dob: req.proposed_primary_contact_dob,
      primary_contact_phone: req.proposed_primary_contact_phone,
      primary_contact_email: req.proposed_primary_contact_email,
      notes: req.proposed_notes,
      status: "active",
      contract_status: "active",
    })
    .select("id")
    .single();
  if (cErr || !newCompany?.id) return { ok: false, error: cErr?.message ?? "Could not create new company." };
  const newId = newCompany.id as string;

  const { error: subErr } = await admin.from("subcompanies").insert({
    parent_company_id: newId,
    is_primary: true,
    name: req.proposed_name as string,
    legal_name: req.proposed_legal_name,
    company_number: req.proposed_company_number,
    registered_address_line1: req.proposed_registered_address_line1,
    registered_address_line2: req.proposed_registered_address_line2,
    registered_town: req.proposed_registered_town,
    registered_county: req.proposed_registered_county,
    registered_postcode: postcode,
    country: req.proposed_country ?? "GB",
    primary_contact_first_name: req.proposed_primary_contact_first_name,
    primary_contact_last_name: req.proposed_primary_contact_last_name,
    primary_contact_dob: req.proposed_primary_contact_dob,
    primary_contact_phone: req.proposed_primary_contact_phone,
    primary_contact_email: req.proposed_primary_contact_email,
    status: "active",
    notes: req.proposed_notes,
  });
  if (subErr) {
    await admin.from("companies").delete().eq("id", newId);
    return { ok: false, error: subErr.message };
  }

  const legalSnap = {
    name: req.proposed_name,
    legal_name: req.proposed_legal_name,
    company_number: req.proposed_company_number,
    registered_address_line1: req.proposed_registered_address_line1,
    registered_address_line2: req.proposed_registered_address_line2,
    registered_town: req.proposed_registered_town,
    registered_county: req.proposed_registered_county,
    registered_postcode: postcode,
    country: req.proposed_country,
    primary_contact_first_name: req.proposed_primary_contact_first_name,
    primary_contact_last_name: req.proposed_primary_contact_last_name,
    primary_contact_dob: req.proposed_primary_contact_dob,
    primary_contact_phone: req.proposed_primary_contact_phone,
    primary_contact_email: req.proposed_primary_contact_email,
    notes: req.proposed_notes,
  };

  const commercial: InitialContractCommercial = { billing_frequency: "monthly", currency: "GBP" };
  const boot = await createInitialCompanyContract(admin, newId, legalSnap, commercial, {
    forceLegacyBootstrap: true,
  });
  if (!boot.ok) {
    await admin.from("companies").delete().eq("id", newId);
    return { ok: false, error: boot.error };
  }

  const { data: newContract } = await admin.from("company_contracts").select("id").eq("parent_company_id", newId).maybeSingle();

  const { data: mems } = await admin
    .from("user_company_memberships")
    .select("id")
    .eq("parent_company_id", oldParentId)
    .eq("status", "active");
  for (const m of mems ?? []) {
    await admin.from("user_subcompany_permissions").delete().eq("membership_id", m.id as string);
  }

  await admin.from("user_company_memberships").update({ parent_company_id: newId }).eq("parent_company_id", oldParentId);

  const { data: prim } = await admin
    .from("subcompanies")
    .select("id")
    .eq("parent_company_id", newId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();
  if (prim?.id) {
    const { data: moved } = await admin.from("user_company_memberships").select("id").eq("parent_company_id", newId);
    for (const m of moved ?? []) {
      await admin.from("user_subcompany_permissions").insert({
        membership_id: m.id as string,
        subcompany_id: prim.id as string,
      });
    }
  }

  await admin.from("profiles").update({ company_id: newId }).eq("company_id", oldParentId);

  await admin
    .from("companies")
    .update({ superseded_by_company_id: newId, status: "inactive", contract_status: "active" })
    .eq("id", oldParentId);

  await admin.from("legal_entity_transitions").insert({
    from_company_id: oldParentId,
    to_company_id: newId,
    change_request_id: id,
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  const now = new Date().toISOString();
  await admin
    .from("company_contract_change_requests")
    .update({
      status: "signed",
      review_status: "completed",
      signed_at: now,
      signed_by: user.id,
      contract_id: newContract?.id ?? null,
    })
    .eq("id", id);

  await notifyCompanyFinanceRoles(admin, newId, "legal_change_applied", {
    change_id: id,
    from_company_id: oldParentId,
    to_company_id: newId,
  });

  revalidatePath("/super-admin/companies");
  revalidatePath("/super-admin/contract-changes");
  revalidatePath("/rental");
  return { ok: true, newCompanyId: newId };
}
