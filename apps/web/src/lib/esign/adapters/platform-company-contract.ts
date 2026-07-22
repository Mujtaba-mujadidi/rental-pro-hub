import { buildContractPdfDocument } from "@/lib/esign/contract-document-text";
import { ESIGN_RECIPIENT_ROLE } from "@/lib/esign/types";
import { createEnvelopeFromPdf } from "@/lib/esign/envelope";
import { createProfessionalContractPdf } from "@/lib/esign/pdf-generate";
import { loadCompanyLogoForContractPdf } from "@/lib/companies/company-logo";
import { revalidateCompanyGate } from "@/lib/auth/company-gate-cache";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const PLATFORM_COMPANY_CONTRACT_CONTEXT = "platform_company_contract" as const;

/**
 * Create an e-sign envelope for a rental company's platform agreement (current contract version).
 * Returns envelopeId for the designer UI.
 */
export async function preparePlatformCompanyContractEnvelope(
  admin: Admin,
  companyId: string,
  createdBy?: string | null,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
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
    .select("id, version_status, terms_snapshot, commercial_snapshot, legal_snapshot")
    .eq("id", contract.current_version_id)
    .maybeSingle();
  if (vErr || !version?.id) return { ok: false, error: vErr?.message ?? "Contract version not found." };
  if (version.version_status === "active" || version.version_status === "legacy_import") {
    return { ok: false, error: "Current version is already active or legacy-imported." };
  }

  const { data: company, error: coErr } = await admin
    .from("companies")
    .select("name, company_number, primary_contact_email, primary_contact_phone, primary_contact_first_name, primary_contact_last_name")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !company?.primary_contact_email?.trim()) {
    return { ok: false, error: coErr?.message ?? "Company primary contact email is required." };
  }

  // Void prior open envelopes for this contract
  await admin
    .from("esign_envelopes")
    .update({ status: "void" })
    .eq("context_type", PLATFORM_COMPANY_CONTRACT_CONTEXT)
    .eq("context_id", contract.id)
    .in("status", ["draft", "awaiting_placement", "owner_signed", "sent", "viewed"]);

  const pdfDoc = buildContractPdfDocument({
    termsSnapshot: version.terms_snapshot as Record<string, unknown> | null,
    commercialSnapshot: version.commercial_snapshot as Record<string, unknown> | null,
    legalSnapshot: {
      ...(version.legal_snapshot as Record<string, unknown> | null),
      company_number:
        (version.legal_snapshot as Record<string, unknown> | null)?.company_number ?? company.company_number,
      primary_contact_email:
        (version.legal_snapshot as Record<string, unknown> | null)?.primary_contact_email ??
        company.primary_contact_email,
      primary_contact_phone:
        (version.legal_snapshot as Record<string, unknown> | null)?.primary_contact_phone ??
        company.primary_contact_phone,
    },
    companyName: company.name,
    platformName: company.name ?? "RMS",
  });
  // Mode chosen on the designer page; start with both blocks until then.
  pdfDoc.signatureMode = "owner_and_recipient";

  const logo = await loadCompanyLogoForContractPdf(admin, companyId);
  if (logo) {
    pdfDoc.logoBytes = logo.bytes;
    pdfDoc.logoContentType = logo.contentType;
  }

  const rendered = await createProfessionalContractPdf(pdfDoc);
  const pdfBytes = rendered.bytes;
  const title = pdfDoc.title;
  const name = [company.primary_contact_first_name, company.primary_contact_last_name].filter(Boolean).join(" ").trim();

  const created = await createEnvelopeFromPdf(admin, {
    contextType: PLATFORM_COMPANY_CONTRACT_CONTEXT,
    contextId: contract.id as string,
    parentCompanyId: companyId,
    title: `${title} · ${company.name ?? "Company"}`,
    pdfBytes,
    suggestedFields: rendered.suggestedFields,
    requiresOwnerSignature: true,
    recipients: [
      {
        email: company.primary_contact_email.trim(),
        name: name || null,
        role: ESIGN_RECIPIENT_ROLE,
      },
    ],
    createdBy: createdBy ?? null,
  });
  if (!created.ok) return created;

  // Link signature request row for audit continuity
  const now = new Date().toISOString();
  await admin.from("contract_signature_requests").insert({
    contract_id: contract.id,
    version_id: version.id,
    provider: "rms_esign",
    provider_submission_id: created.envelopeId,
    status: "draft",
    signatory_email: company.primary_contact_email.trim(),
    signatory_name: name || null,
    metadata: { envelope_id: created.envelopeId },
    audit_trail: [{ at: now, event: "esign_envelope_created", envelope_id: created.envelopeId }],
  });

  await admin.from("company_contracts").update({ status: "draft" }).eq("id", contract.id);

  return { ok: true, envelopeId: created.envelopeId };
}

/** After owner signs: record platform countersignature timestamp (contract still not active). */
export async function onPlatformCompanyContractOwnerSigned(
  admin: Admin,
  envelope: { id: string; context_type: string; context_id: string },
): Promise<void> {
  if (envelope.context_type !== PLATFORM_COMPANY_CONTRACT_CONTEXT) return;
  const now = new Date().toISOString();

  const { data: contract } = await admin
    .from("company_contracts")
    .select("current_version_id")
    .eq("id", envelope.context_id)
    .maybeSingle();
  if (!contract?.current_version_id) return;

  await admin
    .from("company_contract_versions")
    .update({ countersigned_at: now })
    .eq("id", contract.current_version_id);
}

/** After recipient signs: activate company contract. */
export async function onPlatformCompanyContractSigned(
  admin: Admin,
  envelope: { id: string; context_type: string; context_id: string; parent_company_id: string | null },
): Promise<void> {
  if (envelope.context_type !== PLATFORM_COMPANY_CONTRACT_CONTEXT) return;
  const contractId = envelope.context_id;
  const now = new Date().toISOString();

  const { data: contract } = await admin
    .from("company_contracts")
    .select("id, current_version_id, parent_company_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract?.id) return;

  await admin
    .from("contract_signature_requests")
    .update({
      status: "active",
      metadata: { envelope_id: envelope.id, provider: "rms_esign" },
    })
    .eq("provider_submission_id", envelope.id);

  if (contract.current_version_id) {
    const { data: envRow } = await admin
      .from("esign_envelopes")
      .select("signed_pdf_path")
      .eq("id", envelope.id)
      .maybeSingle();
    await admin
      .from("company_contract_versions")
      .update({
        version_status: "active",
        signed_at: now,
        signed_by_customer_at: now,
        rendered_pdf_storage_path: envRow?.signed_pdf_path ?? null,
      })
      .eq("id", contract.current_version_id);
  }

  await admin
    .from("company_contracts")
    .update({ status: "active", contract_signed_at: now })
    .eq("id", contractId);

  const parentId = (contract.parent_company_id as string) || envelope.parent_company_id;
  if (parentId) {
    revalidateCompanyGate(parentId);
    await notifyCompanyFinanceRoles(admin, parentId, "contract_signed", {
      contract_id: contractId,
      envelope_id: envelope.id,
    });
    const { trySendPendingPrimaryInviteAfterContractSigned } = await import("@/app/actions/admin-companies");
    await trySendPendingPrimaryInviteAfterContractSigned(admin, parentId);
  }
}
