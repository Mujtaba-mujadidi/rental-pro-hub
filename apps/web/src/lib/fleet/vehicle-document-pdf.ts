import { PDFDocument } from "pdf-lib";

const MAX_PAGE_EDGE = 1600;
const JPEG_QUALITY = 72;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export type PreparedVehiclePdf = {
  bytes: Buffer;
  contentType: "application/pdf";
  fileName: string;
  pageCount: number;
};

function isPdf(type: string, name: string) {
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

function isImage(type: string) {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp" || type.startsWith("image/");
}

/**
 * Build one compressed PDF from a multi-page PDF and/or one+ images.
 * Images are resized/jpeg-compressed via sharp, then each becomes a page.
 */
export async function prepareVehicleDocumentPdf(
  files: { bytes: Buffer; contentType: string; fileName: string }[],
  docTypeLabel: string,
): Promise<{ ok: true; pdf: PreparedVehiclePdf } | { ok: false; error: string }> {
  if (!files.length) return { ok: false, error: "Choose at least one file." };

  const out = await PDFDocument.create();
  let pageCount = 0;

  try {
    for (const file of files) {
      if (isPdf(file.contentType, file.fileName)) {
        const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) {
          out.addPage(page);
          pageCount += 1;
        }
        continue;
      }

      if (!isImage(file.contentType)) {
        return { ok: false, error: `Unsupported file type for ${file.fileName}. Use PDF or images.` };
      }

      const sharp = (await import("sharp")).default;
      const jpeg = await sharp(file.bytes)
        .rotate()
        .resize({
          width: MAX_PAGE_EDGE,
          height: MAX_PAGE_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      const meta = await sharp(jpeg).metadata();
      const w = meta.width ?? MAX_PAGE_EDGE;
      const h = meta.height ?? MAX_PAGE_EDGE;
      const embedded = await out.embedJpg(jpeg);
      const page = out.addPage([w, h]);
      page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
      pageCount += 1;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build PDF from uploads." };
  }

  if (pageCount < 1) return { ok: false, error: "No pages were produced from the uploads." };

  const pdfBytes = Buffer.from(await out.save({ useObjectStreams: true }));
  if (pdfBytes.length > MAX_OUTPUT_BYTES) {
    return {
      ok: false,
      error: `Document is still too large after compression (${Math.ceil(pdfBytes.length / (1024 * 1024))} MB). Try fewer or smaller images.`,
    };
  }

  const safeLabel = docTypeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "document";
  return {
    ok: true,
    pdf: {
      bytes: pdfBytes,
      contentType: "application/pdf",
      fileName: `${safeLabel}-${Date.now()}.pdf`,
      pageCount,
    },
  };
}
