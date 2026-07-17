import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** PDF header box (points). Logo is scaled to fit inside; aspect ratio preserved. */
export const CONTRACT_HEADER_LOGO_MAX_WIDTH = 140;
export const CONTRACT_HEADER_LOGO_MAX_HEIGHT = 36;

/** Storage/display pixel caps when uploading (fit inside; no upscale). */
export const COMPANY_LOGO_STORE_MAX_WIDTH = 800;
export const COMPANY_LOGO_STORE_MAX_HEIGHT = 400;

export function fitImageWithinBox(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  return { width: srcW * scale, height: srcH * scale };
}

/**
 * Resize/compress a company logo for storage so oversized uploads stay manageable.
 * Prefers PNG (transparency). Falls back to original bytes if sharp fails.
 */
export async function processCompanyLogoForStorage(
  input: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const pipeline = sharp(input).rotate().resize({
      width: COMPANY_LOGO_STORE_MAX_WIDTH,
      height: COMPANY_LOGO_STORE_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (mime === "image/jpeg") {
      const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      return { buffer, contentType: "image/jpeg", ext: "jpg" };
    }
    // PNG / WebP → PNG so contracts (pdf-lib) can embed reliably.
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, contentType: "image/png", ext: "png" };
  } catch (e) {
    console.warn("[company-logo] sharp process failed; storing original", e);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    return { buffer: input, contentType: mime, ext };
  }
}

/** Load company logo bytes for contract PDF embedding (PNG/JPEG only). */
export async function loadCompanyLogoForContractPdf(
  admin: Admin,
  companyId: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { data: company, error } = await admin
    .from("companies")
    .select("logo_storage_path")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !company?.logo_storage_path) return null;

  const path = company.logo_storage_path as string;
  const { data, error: dlErr } = await admin.storage.from("company-logos").download(path);
  if (dlErr || !data) {
    console.warn("[company-logo] download failed", path, dlErr?.message);
    return null;
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const lower = path.toLowerCase();
  let contentType = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (lower.endsWith(".webp")) contentType = "image/webp";

  // pdf-lib cannot embed WebP — convert via sharp when needed.
  if (contentType === "image/webp") {
    try {
      const sharp = (await import("sharp")).default;
      const png = await sharp(Buffer.from(bytes)).png().toBuffer();
      return { bytes: new Uint8Array(png), contentType: "image/png" };
    } catch (e) {
      console.warn("[company-logo] webp→png failed; omitting logo from PDF", e);
      return null;
    }
  }

  return { bytes, contentType };
}
