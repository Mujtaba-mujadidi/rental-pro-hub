"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea, requireSuperAdmin, type AppProfile } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canRequestContractChange } from "@/lib/auth/rental-permissions";
import {
  assertContractChangeHasDisplayChanges,
  assertContractChangeHasSubstantiveChanges,
  assertContractChangeIsFormattingOnly,
  contractChangeRequestRowFromParsed,
  parseContractChangeFormData,
} from "@/lib/companies/contract-change-form";
import type { ContractChangeFieldSnapshot } from "@/lib/companies/contract-change-diff";
import {
  companyDetailsUpdateFromSnapshot,
  primarySubcompanyMirrorFromSnapshot,
} from "@/lib/companies/company-details-update";
import { notifyCompanyFinanceRoles, notifySuperAdmins } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ContractChangeActionResult = { ok: true; draftId?: string } | { ok: false; error: string };
export type ApplyContractChangeResult = { ok: true } | { ok: false; error: string };

const COMPANY_SNAPSHOT_COLUMNS =
  "name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, notes";

async function loadChangeContext(profile: AppProfile) {
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false as const, error: frozen.error };
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false as const, error: "Missing rental company context." };
  if (!canRequestContractChange(profile)) {
    return {
      ok: false as const,
      error: "Only company owners and admins can request legal or contract changes.",
    };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: currentCompany, error: companyErr } = await admin
    .from("companies")
    .select(COMPANY_SNAPSHOT_COLUMNS)
    .eq("id", parentCompanyId)
    .maybeSingle();
  if (companyErr || !currentCompany) {
    return { ok: false as const, error: companyErr?.message ?? "Company not found." };
  }

  return {
    ok: true as const,
    admin,
    parentCompanyId,
    currentCompany: currentCompany as ContractChangeFieldSnapshot,
    profileId: profile.id,
  };
}

function revalidateContractChangePaths() {
  revalidatePath("/rental");
  revalidatePath("/rental/contract");
  revalidatePath("/super-admin/companies");
  revalidatePath("/super-admin/contract-changes");
}

/** Save or update a server-side draft (does not notify super admin). */
export async function saveRentalContractChangeDraftAction(formData: FormData): Promise<ContractChangeActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const ctx = await loadChangeContext(profile);
  if (!ctx.ok) return ctx;

  const parsed = parseContractChangeFormData(formData);
  if (!parsed.ok) return parsed;

  const changeCheck = assertContractChangeHasSubstantiveChanges(ctx.currentCompany, parsed.data.proposed);
  if (!changeCheck.ok) return changeCheck;

  const { data: submitted } = await ctx.admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "pending_signature")
    .neq("review_status", "rejected")
    .limit(1)
    .maybeSingle();
  if (submitted?.id) {
    return { ok: false, error: "A contract change is already with platform staff. You cannot edit until it is completed or rejected." };
  }

  const row = contractChangeRequestRowFromParsed(
    ctx.parentCompanyId,
    ctx.profileId,
    parsed.data,
    "draft",
    "draft",
  );

  const { data: existingDraft } = await ctx.admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "draft")
    .maybeSingle();

  if (existingDraft?.id) {
    const { error } = await ctx.admin.from("company_contract_change_requests").update(row).eq("id", existingDraft.id);
    if (error) return { ok: false, error: error.message };
    revalidateContractChangePaths();
    return { ok: true, draftId: existingDraft.id };
  }

  const { data: inserted, error: insertErr } = await ctx.admin
    .from("company_contract_change_requests")
    .insert(row)
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidateContractChangePaths();
  return { ok: true, draftId: inserted.id };
}

/** Submit a saved draft (or current form) for super-admin review. */
export async function submitRentalContractChangeDraftAction(formData: FormData): Promise<ContractChangeActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const ctx = await loadChangeContext(profile);
  if (!ctx.ok) return ctx;

  const parsed = parseContractChangeFormData(formData);
  if (!parsed.ok) return parsed;

  const changeCheck = assertContractChangeHasSubstantiveChanges(ctx.currentCompany, parsed.data.proposed);
  if (!changeCheck.ok) return changeCheck;

  const { data: submitted } = await ctx.admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "pending_signature")
    .neq("review_status", "rejected")
    .limit(1)
    .maybeSingle();
  if (submitted?.id) {
    return { ok: false, error: "A contract change is already in progress." };
  }

  const row = contractChangeRequestRowFromParsed(
    ctx.parentCompanyId,
    ctx.profileId,
    parsed.data,
    "pending_signature",
    "pending_review",
  );

  const { data: existingDraft } = await ctx.admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "draft")
    .maybeSingle();

  let changeId: string;
  if (existingDraft?.id) {
    const { error } = await ctx.admin.from("company_contract_change_requests").update(row).eq("id", existingDraft.id);
    if (error) return { ok: false, error: error.message };
    changeId = existingDraft.id;
  } else {
    const { data: inserted, error: insertErr } = await ctx.admin
      .from("company_contract_change_requests")
      .insert(row)
      .select("id")
      .single();
    if (insertErr || !inserted?.id) return { ok: false, error: insertErr?.message ?? "Could not create request." };
    changeId = inserted.id;
  }

  const { error: upErr } = await ctx.admin
    .from("companies")
    .update({ contract_status: "pending_renewal" })
    .eq("id", ctx.parentCompanyId);
  if (upErr) {
    await ctx.admin
      .from("company_contract_change_requests")
      .update({ status: "draft", review_status: "draft" })
      .eq("id", changeId);
    return { ok: false, error: upErr.message };
  }

  await notifySuperAdmins(ctx.admin, "contract_change_requested", {
    parent_company_id: ctx.parentCompanyId,
    transition_type: parsed.data.transition_type,
    requested_by: ctx.profileId,
    change_id: changeId,
  });

  revalidateContractChangePaths();
  return { ok: true, draftId: changeId };
}

/** Save formatting-only legal detail tweaks directly — no contract renewal. */
export async function saveRentalCompanyFormattingDetailsAction(
  formData: FormData,
): Promise<ContractChangeActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const ctx = await loadChangeContext(profile);
  if (!ctx.ok) return ctx;

  const parsed = parseContractChangeFormData(formData);
  if (!parsed.ok) return parsed;
  if (parsed.data.transition_type !== "detail_change") {
    return {
      ok: false,
      error: "Replacing your legal entity always requires a new platform agreement. Switch to that option and submit for review.",
    };
  }

  const formattingCheck = assertContractChangeIsFormattingOnly(
    ctx.currentCompany,
    parsed.data.proposedForDiff,
  );
  if (!formattingCheck.ok) return formattingCheck;

  const { data: submitted } = await ctx.admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "pending_signature")
    .neq("review_status", "rejected")
    .limit(1)
    .maybeSingle();
  if (submitted?.id) {
    return {
      ok: false,
      error: "A contract change is already with platform staff. Wait until it is completed or rejected before updating details.",
    };
  }

  const companyUpdate = companyDetailsUpdateFromSnapshot(parsed.data.proposed);
  const { error: companyErr } = await ctx.admin
    .from("companies")
    .update(companyUpdate)
    .eq("id", ctx.parentCompanyId);
  if (companyErr) return { ok: false, error: companyErr.message };

  const { data: primarySubcompany } = await ctx.admin
    .from("subcompanies")
    .select("id")
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primarySubcompany?.id) {
    const mirror = primarySubcompanyMirrorFromSnapshot(parsed.data.proposed);
    const { error: subErr } = await ctx.admin.from("subcompanies").update(mirror).eq("id", primarySubcompany.id);
    if (subErr) return { ok: false, error: subErr.message };
  }

  await ctx.admin
    .from("company_contract_change_requests")
    .delete()
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "draft");

  revalidateContractChangePaths();
  return { ok: true };
}

export async function discardRentalContractChangeDraftAction(): Promise<ContractChangeActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const ctx = await loadChangeContext(profile);
  if (!ctx.ok) return ctx;

  const { error } = await ctx.admin
    .from("company_contract_change_requests")
    .delete()
    .eq("parent_company_id", ctx.parentCompanyId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  revalidateContractChangePaths();
  return { ok: true };
}

/** @deprecated Use saveRentalContractChangeDraftAction + submitRentalContractChangeDraftAction */
export async function requestRentalCompanyContractChangeAction(formData: FormData): Promise<ContractChangeActionResult> {
  const save = await saveRentalContractChangeDraftAction(formData);
  if (!save.ok) return save;
  return submitRentalContractChangeDraftAction(formData);
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

  revalidateContractChangePaths();
  return { ok: true };
}
