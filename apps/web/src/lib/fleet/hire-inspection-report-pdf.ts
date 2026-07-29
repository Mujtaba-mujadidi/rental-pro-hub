import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  buildHireInspectionReportSections,
  hireInspectionReportFileName,
  type HireInspectionReportInput,
} from "@/lib/fleet/hire-inspection-report";

const PAGE_MARGIN = 48;
const LINE_HEIGHT = 14;
const PHOTO_MAX_EDGE = 1200;

export type HireInspectionReportPdf = {
  bytes: Uint8Array;
  fileName: string;
};

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildHireInspectionReportPdf(
  input: HireInspectionReportInput,
  photoBuffers: { caption?: string | null; bytes: Buffer; contentType: string }[] = [],
): Promise<HireInspectionReportPdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage();
  let { width, height } = page.getSize();
  let y = height - PAGE_MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed >= PAGE_MARGIN) return;
    page = doc.addPage();
    ({ width, height } = page.getSize());
    y = height - PAGE_MARGIN;
  }

  function drawLine(text: string, bold = false) {
    const activeFont = bold ? fontBold : font;
    const size = bold ? 13 : 11;
    for (const line of wrapText(text, 88)) {
      ensureSpace(LINE_HEIGHT + 2);
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: y - size,
        size,
        font: activeFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= LINE_HEIGHT + (bold ? 4 : 2);
    }
  }

  for (const section of buildHireInspectionReportSections(input)) {
    section.forEach((line, index) => drawLine(line, index === 0));
    y -= 6;
  }

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
    const embedded = await doc.embedJpg(jpeg);

    const photoPage = doc.addPage();
    const pageSize = photoPage.getSize();
    const maxW = pageSize.width - PAGE_MARGIN * 2;
    const maxH = pageSize.height - PAGE_MARGIN * 2 - 24;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const x = (pageSize.width - drawW) / 2;
    const yImg = PAGE_MARGIN + 12;

    photoPage.drawText(photo.caption?.trim() || `Photo ${index + 1}`, {
      x: PAGE_MARGIN,
      y: pageSize.height - PAGE_MARGIN,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    photoPage.drawImage(embedded, { x, y: yImg, width: drawW, height: drawH });
  }

  const bytes = await doc.save();
  return {
    bytes,
    fileName: hireInspectionReportFileName(input.kind, input.vehicleLabel),
  };
}
