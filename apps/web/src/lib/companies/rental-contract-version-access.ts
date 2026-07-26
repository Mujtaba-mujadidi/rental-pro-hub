import type { AppProfile } from "@/lib/auth/profile";
import { platformAgreementPdfFileName } from "@/lib/companies/contract-version-display";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type RentalContractVersionPdfAccess = {
  pdfPath: string;
  versionNumber: number;
  fileName: string;
};

/** Rental staff may stream a signed platform agreement PDF for their parent company only. */
export async function loadRentalContractVersionPdfAccess(
  admin: Admin,
  profile: AppProfile,
  versionId: string,
): Promise<RentalContractVersionPdfAccess | null> {
  const companyId = profile.company_id?.trim();
  const id = versionId.trim();
  if (!companyId || profile.role !== "rental_company" || !id) return null;

  const { data: row, error } = await admin
    .from("company_contract_versions")
    .select("id, version_number, rendered_pdf_storage_path, contract_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.contract_id) return null;

  const { data: contract } = await admin
    .from("company_contracts")
    .select("parent_company_id")
    .eq("id", row.contract_id as string)
    .maybeSingle();

  if (contract?.parent_company_id !== companyId) return null;

  const pdfPath = (row.rendered_pdf_storage_path as string | null | undefined)?.trim();
  if (!pdfPath) return null;

  const versionNumber = row.version_number as number;
  return {
    pdfPath,
    versionNumber,
    fileName: platformAgreementPdfFileName(versionNumber),
  };
}
