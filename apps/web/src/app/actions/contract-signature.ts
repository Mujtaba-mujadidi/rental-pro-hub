"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { docusealCreateSubmission } from "@/lib/docuseal/client";
import { getDocusealContractTemplateId } from "@/lib/docuseal/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SendContractSignatureResult = { ok: true } | { ok: false; error: string };

export async function sendCompanyContractForSignatureAction(parentCompanyId: string): Promise<SendContractSignatureResult> {
  await requireSuperAdmin();
  const companyId = parentCompanyId?.trim();
  if (!companyId) return { ok: false, error: "Missing company." };

  const templateId = getDocusealContractTemplateId();
  if (!templateId) {
    return {
      ok: false,
      error:
        "DOCUSEAL_CONTRACT_TEMPLATE_ID is not set. Add it in environment or use legacy bootstrap signing for local development.",
    };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: contract, error: cErr } = await admin
    .from("company_contracts")
    .select("id, status, current_version_id, parent_company_id")
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (cErr || !contract?.id || !contract.current_version_id) {
    return { ok: false, error: cErr?.message ?? "Contract not found for company." };
  }

  const { data: version, error: vErr } = await admin
    .from("company_contract_versions")
    .select("id, version_status")
    .eq("id", contract.current_version_id)
    .maybeSingle();
  if (vErr || !version?.id) return { ok: false, error: vErr?.message ?? "Contract version not found." };
  if (version.version_status === "active" || version.version_status === "legacy_import") {
    return { ok: false, error: "Current version is already active or legacy-imported." };
  }

  const { data: company, error: coErr } = await admin
    .from("companies")
    .select("primary_contact_email, primary_contact_first_name, primary_contact_last_name")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !company?.primary_contact_email?.trim()) {
    return { ok: false, error: coErr?.message ?? "Company primary contact email is required for e-sign." };
  }

  const email = company.primary_contact_email.trim();
  const name = [company.primary_contact_first_name, company.primary_contact_last_name].filter(Boolean).join(" ").trim();

  const ds = await docusealCreateSubmission({
    template_id: templateId,
    send_email: true,
    name: `Rental contract · ${companyId.slice(0, 8)}`,
    submitters: [{ role: "First Party", email, ...(name ? { name } : {}) }],
    metadata: {
      rms_parent_company_id: companyId,
      rms_contract_id: contract.id,
      rms_version_id: version.id,
    },
  });
  if (!ds.ok) return { ok: false, error: ds.error };

  const now = new Date().toISOString();
  const { error: insErr } = await admin.from("contract_signature_requests").insert({
    contract_id: contract.id,
    version_id: version.id,
    provider: "docuseal",
    provider_submission_id: String(ds.submissionId),
    status: "sent",
    signatory_email: email,
    signatory_name: name || null,
    metadata: { docuseal: ds.raw },
    audit_trail: [{ at: now, event: "submission_created", submission_id: ds.submissionId }],
  });
  if (insErr) return { ok: false, error: insErr.message };

  await admin
    .from("company_contracts")
    .update({ status: "sent_for_signature" })
    .eq("id", contract.id);
  await admin
    .from("company_contract_versions")
    .update({
      version_status: "sent_for_signature",
      sent_for_signature_at: now,
    })
    .eq("id", version.id);

  revalidatePath("/super-admin/companies");
  revalidatePath("/rental");
  return { ok: true };
}
