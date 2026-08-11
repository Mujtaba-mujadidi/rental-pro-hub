import { createHireSummaryPdfCanvas, type HireSummaryPdfInput } from "@/lib/esign/pdf-generate";
import {
  buildHirePaymentStatementContent,
  type HirePaymentStatementContent,
} from "@/lib/fleet/hire-payment-statement";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";

export type HirePaymentStatementPdf = {
  bytes: Uint8Array;
  fileName: string;
};

export async function buildHirePaymentStatementPdf(
  data: HirePaymentsPageData,
  summary: HireSummaryPdfInput,
  content: HirePaymentStatementContent = buildHirePaymentStatementContent(data),
): Promise<HirePaymentStatementPdf> {
  const canvas = await createHireSummaryPdfCanvas({
    ...summary,
    title: summary.title || "Hire payment statement",
    documentLabel: summary.documentLabel ?? "Payment statement",
  });

  canvas.addPage();
  for (const section of content.sections) {
    canvas.drawSectionHeading(section.heading);
    for (const line of section.lines) {
      canvas.drawBodyLine(line);
    }
    canvas.setY(canvas.getY() - 6);
  }

  return {
    bytes: await canvas.finalize(),
    fileName: content.fileName,
  };
}
