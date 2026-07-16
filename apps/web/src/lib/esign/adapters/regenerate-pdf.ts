import { buildContractPdfDocument } from "@/lib/esign/contract-document-text";
import { createProfessionalContractPdf } from "@/lib/esign/pdf-generate";
import { ESIGN_BUCKET, type EsignFieldLayoutItem } from "@/lib/esign/types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Rebuild unsigned PDF for an envelope with the correct execution placeholders
 * for the chosen signature mode (recipient-only omits the owner block).
 */
export async function regenerateEnvelopePdfForSignatureMode(
  admin: Admin,
  envelopeId: string,
  mode: "recipient_only" | "owner_and_recipient",
): Promise<
  | { ok: true; suggestedFields: EsignFieldLayoutItem[] }
  | { ok: false; error: string }
> {
  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, context_type, context_id, parent_company_id, unsigned_pdf_path")
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id) return { ok: false, error: error?.message ?? "Envelope not found." };
  if (env.context_type !== "platform_company_contract" || !env.context_id) {
    return { ok: false, error: "Unsupported envelope context for PDF regenerate." };
  }

  const { data: contract } = await admin
    .from("company_contracts")
    .select("id, current_version_id, parent_company_id")
    .eq("id", env.context_id)
    .maybeSingle();
  if (!contract?.current_version_id) return { ok: false, error: "Contract version not found." };

  const { data: version } = await admin
    .from("company_contract_versions")
    .select("terms_snapshot, commercial_snapshot, legal_snapshot")
    .eq("id", contract.current_version_id)
    .maybeSingle();
  if (!version) return { ok: false, error: "Contract snapshots not found." };

  const parentId = (contract.parent_company_id as string) || (env.parent_company_id as string | null);
  let companyName: string | null = null;
  if (parentId) {
    const { data: company } = await admin.from("companies").select("name").eq("id", parentId).maybeSingle();
    companyName = company?.name ?? null;
  }

  const pdfDoc = buildContractPdfDocument({
    termsSnapshot: version.terms_snapshot as Record<string, unknown> | null,
    commercialSnapshot: version.commercial_snapshot as Record<string, unknown> | null,
    legalSnapshot: version.legal_snapshot as Record<string, unknown> | null,
    companyName,
    platformName: "RMS",
  });
  pdfDoc.signatureMode = mode;
  if (mode === "recipient_only") {
    pdfDoc.acceptanceText =
      "By signing, the customer confirms they have read and agree to the terms and commercial summary in this agreement. This is an electronic signature for contractual acceptance (not a qualified electronic signature under eIDAS).";
    pdfDoc.parties = pdfDoc.parties.map((p) =>
      p.roleLabel === "Platform" ? { ...p, lines: ["Contract owner / service provider"] } : p,
    );
  }

  const rendered = await createProfessionalContractPdf(pdfDoc);
  const path = (env.unsigned_pdf_path as string) || `${envelopeId}/unsigned.pdf`;
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(path, rendered.bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { ok: false, error: `PDF update failed: ${upErr.message}` };

  await admin
    .from("esign_envelopes")
    .update({
      unsigned_pdf_path: path,
      suggested_field_layout: rendered.suggestedFields,
    })
    .eq("id", envelopeId);

  return { ok: true, suggestedFields: rendered.suggestedFields };
}
