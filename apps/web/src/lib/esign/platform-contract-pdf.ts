import { buildContractPdfDocument } from "@/lib/esign/contract-document-text";
import type { ContractPdfInput } from "@/lib/esign/pdf-generate";
import type { PlatformLetterhead } from "@/lib/platform/letterhead";
import { getPlatformLetterhead } from "@/lib/platform/letterhead";

/** Platform agreement PDF input — letterhead is the operator, customer details stay in parties only. */
export function buildPlatformCompanyContractPdfDocument(input: {
  termsSnapshot: Record<string, unknown> | null | undefined;
  commercialSnapshot: Record<string, unknown> | null | undefined;
  legalSnapshot: Record<string, unknown> | null | undefined;
  customerCompanyName?: string | null;
  letterhead?: PlatformLetterhead;
}): ContractPdfInput {
  const letterhead = input.letterhead ?? getPlatformLetterhead();
  return buildContractPdfDocument({
    termsSnapshot: input.termsSnapshot,
    commercialSnapshot: input.commercialSnapshot,
    legalSnapshot: input.legalSnapshot,
    companyName: input.customerCompanyName,
    letterhead,
  });
}

export async function attachPlatformLogoToContractPdf(pdfDoc: ContractPdfInput): Promise<void> {
  const { loadPlatformLogoForContractPdf } = await import("@/lib/platform/letterhead");
  const logo = await loadPlatformLogoForContractPdf();
  if (logo) {
    pdfDoc.logoBytes = logo.bytes;
    pdfDoc.logoContentType = logo.contentType;
  }
}
