import { createHireSummaryPdfCanvas, type HireSummaryPdfInput } from "@/lib/esign/pdf-generate";
import {
  buildHireInspectionReportDamageSection,
  buildHireInspectionReportFindingsSections,
  buildHireInspectionReportReadingsSection,
  hireInspectionReportFileName,
  type HireInspectionReportInput,
} from "@/lib/fleet/hire-inspection-report";

const PHOTO_MAX_EDGE = 1200;
/** Cap diagram height so the damage list can sit on the same page. */
const DIAGRAM_MAX_HEIGHT_RATIO = 0.48;

export type HireInspectionReportPdf = {
  bytes: Uint8Array;
  fileName: string;
};

export type HireInspectionReportPdfOptions = {
  summary: HireSummaryPdfInput;
  diagramPng?: Buffer | null;
};

function drawInspectionSections(
  canvas: Awaited<ReturnType<typeof createHireSummaryPdfCanvas>>,
  sections: string[][],
): void {
  for (const section of sections) {
    if (!section.length) continue;
    canvas.drawSectionHeading(section[0]!);
    for (let i = 1; i < section.length; i++) {
      canvas.drawBodyLine(section[i]!);
    }
    canvas.setY(canvas.getY() - 4);
  }
}

async function drawDiagramAndDamagePage(
  canvas: Awaited<ReturnType<typeof createHireSummaryPdfCanvas>>,
  diagramPng: Buffer | null | undefined,
  damageSection: string[],
): Promise<void> {
  canvas.addPage();
  canvas.drawSectionHeading("Damage report");

  if (diagramPng?.length) {
    const embedded = await canvas.embedPng(diagramPng);
    const marginX = canvas.getMarginX();
    const maxW = canvas.getContentWidth();
    const contentTop = canvas.getY();
    const maxDiagramH = (contentTop - canvas.getMarginBottom()) * DIAGRAM_MAX_HEIGHT_RATIO;
    const scale = Math.min(maxW / embedded.width, maxDiagramH / embedded.height, 1);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    const x = marginX + (maxW - drawW) / 2;
    const y = contentTop - drawH;

    canvas.getPage().drawImage(embedded, { x, y, width: drawW, height: drawH });
    canvas.setY(y - 12);
  }

  drawInspectionSections(canvas, [damageSection]);
}

export async function buildHireInspectionReportPdf(
  input: HireInspectionReportInput,
  photoBuffers: { caption?: string | null; bytes: Buffer; contentType: string }[] = [],
  options: HireInspectionReportPdfOptions,
): Promise<HireInspectionReportPdf> {
  const canvas = await createHireSummaryPdfCanvas(options.summary);

  canvas.addPage();
  drawInspectionSections(canvas, [buildHireInspectionReportReadingsSection(input)]);
  drawInspectionSections(canvas, buildHireInspectionReportFindingsSections(input));

  await drawDiagramAndDamagePage(canvas, options.diagramPng, buildHireInspectionReportDamageSection(input));

  for (const [index, photo] of photoBuffers.entries()) {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(photo.bytes)
      .rotate()
      .resize({
        width: PHOTO_MAX_EDGE,
        height: PHOTO_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();

    const meta = await sharp(jpeg).metadata();
    const imgW = meta.width ?? PHOTO_MAX_EDGE;
    const imgH = meta.height ?? PHOTO_MAX_EDGE;
    const embedded = await canvas.embedJpg(jpeg);

    canvas.addPage();
    const caption = photo.caption?.trim() || `Photo ${index + 1}`;
    canvas.drawSectionHeading(caption);

    const marginX = canvas.getMarginX();
    const maxW = canvas.getContentWidth();
    const maxH = canvas.getY() - canvas.getMarginBottom() - 12;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const x = marginX + (maxW - drawW) / 2;
    const y = canvas.getY() - drawH;

    canvas.getPage().drawImage(embedded, { x, y, width: drawW, height: drawH });
  }

  const bytes = await canvas.finalize();
  return {
    bytes,
    fileName: hireInspectionReportFileName(input.kind, input.vehicleLabel),
  };
}
