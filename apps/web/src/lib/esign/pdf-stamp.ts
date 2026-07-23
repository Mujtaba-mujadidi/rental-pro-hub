import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { stampValueFromEsignDateInput } from "@/lib/esign/datetime";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export type FieldValueMap = Record<
  string,
  { type: "signature" | "date" | "text"; value: string }
>;

/**
 * Stamp signer values onto PDF using normalized field coordinates.
 * Signature values are raw PNG/JPEG data URLs (or empty).
 */
export async function stampPdfWithFieldValues(
  unsignedPdf: Uint8Array,
  fields: EsignFieldLayoutItem[],
  values: FieldValueMap,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(unsignedPdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const field of fields) {
    const pageIndex = Math.max(0, field.page - 1);
    const page = pages[pageIndex];
    if (!page) continue;
    const { width, height } = page.getSize();
    const x = field.x * width;
    const yFromTop = field.y * height;
    const w = field.w * width;
    const h = field.h * height;
    // pdf-lib y is from bottom
    const y = height - yFromTop - h;

    const entry = values[field.id];
    if (!entry?.value) continue;

    if (field.type === "signature" && entry.value.startsWith("data:image")) {
      const base64 = entry.value.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Buffer.from(base64, "base64");
      const isPng = entry.value.includes("image/png");
      const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const inset = Math.min(4, w * 0.04, h * 0.08);
      page.drawImage(img, {
        x: x + inset,
        y: y + inset,
        width: Math.max(1, w - inset * 2),
        height: Math.max(1, h - inset * 2),
      });
    } else {
      const text =
        field.type === "date"
          ? stampValueFromEsignDateInput(entry.value).slice(0, 200)
          : entry.value.slice(0, 200);
      const size = Math.min(11, Math.max(8, h * 0.45));
      page.drawText(text, {
        x: x + 2,
        y: y + h / 2 - size / 2,
        size,
        font,
        color: rgb(0.05, 0.05, 0.08),
        maxWidth: w - 4,
      });
    }
  }

  return doc.save();
}
