"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { revalidateCompanyGate } from "@/lib/auth/company-gate-cache";
import { prepareContractChangeRenewalEsign } from "@/lib/esign/contract-change-renewal";
import { PLATFORM_COMPANY_CONTRACT_CONTEXT } from "@/lib/esign/adapters/platform-company-contract";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type ReviewContractChangeResult =
  | { ok: true; envelopeId?: string }
  | { ok: false; error: string };

/** Restore rental access and tear down renewal prep when a change is cancelled or rejected. */
async function cancelContractChangeRenewalPreparation(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  parentCompanyId: string,
  changeRequestId: string,
  esignEnvelopeId: string | null,
) {
  if (esignEnvelopeId) {
    await admin
      .from("esign_envelopes")
      .update({ status: "void" })
      .eq("id", esignEnvelopeId)
      .in("status", ["draft", "awaiting_placement", "owner_signed", "sent", "viewed"]);
  }

  await admin
    .from("company_contract_versions")
    .update({ version_status: "superseded", superseded_at: new Date().toISOString() })
    .eq("change_request_id", changeRequestId)
    .in("version_status", ["draft", "sent_for_signature", "viewed", "signed_by_customer"]);

  const { data: contract } = await admin
    .from("company_contracts")
    .select("id, status, current_version_id")
    .eq("parent_company_id", parentCompanyId)
    .maybeSingle();
  if (!contract?.id || contract.status === "active") return;

  const { data: activeVersion } = await admin
    .from("company_contract_versions")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("version_status", "active")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const updates: { status: string; current_version_id?: string } = { status: "active" };
  if (activeVersion?.id) {
    updates.current_version_id = activeVersion.id;
  }

  await admin.from("company_contracts").update(updates).eq("id", contract.id);

  await admin
    .from("esign_envelopes")
    .update({ status: "void" })
    .eq("context_type", PLATFORM_COMPANY_CONTRACT_CONTEXT)
    .eq("context_id", contract.id)
    .in("status", ["draft", "awaiting_placement", "owner_signed", "sent", "viewed"]);

  revalidateCompanyGate(parentCompanyId);
}

export async function reviewContractChangeRequestAction(
  formData: FormData,
): Promise<ReviewContractChangeResult> {
  const { user } = await requireSuperAdmin();
  const changeId = nullIfEmpty(formData.get("change_id"));
  const decision = nullIfEmpty(formData.get("decision"));
  const comment = nullIfEmpty(formData.get("comment"));
  if (!changeId || !decision) return { ok: false, error: "Missing fields." };

  const admin = createSupabaseAdminClient();
  const { data: row, error: gErr } = await admin
    .from("company_contract_change_requests")
    .select("id, parent_company_id, review_status, status, transition_type, esign_envelope_id")
    .eq("id", changeId)
    .maybeSingle();
  if (gErr || !row) return { ok: false, error: gErr?.message ?? "Request not found." };
  if (row.status !== "pending_signature") {
    return { ok: false, error: "This request is not open for review." };
  }

  const now = new Date().toISOString();
  if (decision === "approve") {
    if (row.review_status === "awaiting_signature" || row.review_status === "approved") {
      return { ok: false, error: "This request is already approved. Reject it instead if you need to undo that decision." };
    }
    if (row.transition_type === "detail_change") {
      const prepared = await prepareContractChangeRenewalEsign(admin, changeId, user.id);
      if (!prepared.ok) return prepared;

      await admin
        .from("company_contract_change_requests")
        .update({
          reviewed_at: now,
          reviewed_by: user.id,
          review_comment: comment,
        })
        .eq("id", changeId);

      await notifyCompanyFinanceRoles(admin, row.parent_company_id as string, "contract_change_review", {
        change_id: changeId,
        decision: "approved_awaiting_signature",
        envelope_id: prepared.envelopeId,
        href: "/rental/contract",
      });

      revalidatePath("/super-admin/contract-changes");
      revalidatePath("/super-admin/companies");
      revalidatePath("/rental");
      revalidatePath("/rental/contract");
      revalidateCompanyGate(row.parent_company_id as string);
      return { ok: true, envelopeId: prepared.envelopeId };
    }

    const { error } = await admin
      .from("company_contract_change_requests")
      .update({
        review_status: "awaiting_signature",
        reviewed_at: now,
        reviewed_by: user.id,
        review_comment: comment,
      })
      .eq("id", changeId);
    if (error) return { ok: false, error: error.message };
    await notifyCompanyFinanceRoles(admin, row.parent_company_id as string, "contract_change_review", {
      change_id: changeId,
      decision: "approved_awaiting_signature",
      href: "/rental/contract",
    });
  } else if (decision === "reject") {
    if (!comment) return { ok: false, error: "Comment is required to reject." };
    const { error } = await admin
      .from("company_contract_change_requests")
      .update({
        review_status: "rejected",
        reviewed_at: now,
        reviewed_by: user.id,
        review_comment: comment,
        status: "rejected",
      })
      .eq("id", changeId);
    if (error) return { ok: false, error: error.message };
    await admin.from("companies").update({ contract_status: "active" }).eq("id", row.parent_company_id);
    await cancelContractChangeRenewalPreparation(
      admin,
      row.parent_company_id as string,
      changeId,
      (row.esign_envelope_id as string | null) ?? null,
    );
    await notifyCompanyFinanceRoles(admin, row.parent_company_id as string, "contract_change_review", {
      change_id: changeId,
      decision: "rejected",
      comment,
      href: "/rental/contract",
    });
  } else {
    return { ok: false, error: "Invalid decision." };
  }

  revalidatePath("/super-admin/contract-changes");
  revalidatePath("/super-admin/companies");
  revalidatePath("/rental");
  revalidatePath("/rental/contract");
  revalidateCompanyGate(row.parent_company_id as string);
  return { ok: true };
}

export async function prepareContractChangeRenewalEsignAction(
  changeId: string,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const prepared = await prepareContractChangeRenewalEsign(admin, changeId.trim(), user.id);
  if (prepared.ok) {
    revalidatePath("/super-admin/contract-changes");
    revalidatePath("/super-admin/companies");
  }
  return prepared;
}

/** Clears `companies.contract_status = pending_renewal` when no open change request exists. */
export async function clearStuckContractRenewalAction(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const trimmed = companyId?.trim();
  if (!trimmed) return { ok: false, error: "Missing company." };

  const admin = createSupabaseAdminClient();
  const { data: open, error: openErr } = await admin
    .from("company_contract_change_requests")
    .select("id")
    .eq("parent_company_id", trimmed)
    .eq("status", "pending_signature")
    .limit(1)
    .maybeSingle();
  if (openErr) return { ok: false, error: openErr.message };
  if (open?.id) {
    return {
      ok: false,
      error: "An open change request exists for this company. Review it in the list above instead of clearing the lock.",
    };
  }

  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("id, contract_status")
    .eq("id", trimmed)
    .maybeSingle();
  if (companyErr || !company) return { ok: false, error: companyErr?.message ?? "Company not found." };
  if (company.contract_status !== "pending_renewal") {
    return { ok: false, error: "This company is not marked renewal pending." };
  }

  const { error: upErr } = await admin.from("companies").update({ contract_status: "active" }).eq("id", trimmed);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/super-admin/contract-changes");
  revalidatePath("/super-admin/companies");
  revalidatePath("/rental");
  revalidatePath("/rental/contract");
  return { ok: true };
}

export async function getContractChangeRequestHistoryAction(parentCompanyId: string) {
  await requireSuperAdmin();
  const { fetchContractChangeHistoryForCompany } = await import("@/lib/admin/contract-change-requests-query");
  return fetchContractChangeHistoryForCompany(parentCompanyId);
}
