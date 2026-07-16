"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function reviewContractChangeRequestAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const changeId = nullIfEmpty(formData.get("change_id"));
  const decision = nullIfEmpty(formData.get("decision"));
  const comment = nullIfEmpty(formData.get("comment"));
  if (!changeId || !decision) return { ok: false, error: "Missing fields." };

  const admin = createSupabaseAdminClient();
  const { data: row, error: gErr } = await admin
    .from("company_contract_change_requests")
    .select("id, parent_company_id, review_status, status")
    .eq("id", changeId)
    .maybeSingle();
  if (gErr || !row) return { ok: false, error: gErr?.message ?? "Request not found." };
  if (row.status !== "pending_signature") {
    return { ok: false, error: "This request is not open for review." };
  }

  const now = new Date().toISOString();
  if (decision === "approve") {
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
    await notifyCompanyFinanceRoles(admin, row.parent_company_id as string, "contract_change_review", {
      change_id: changeId,
      decision: "rejected",
      comment,
    });
  } else {
    return { ok: false, error: "Invalid decision." };
  }

  revalidatePath("/super-admin/contract-changes");
  revalidatePath("/rental");
  return { ok: true };
}
