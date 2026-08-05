import {
  COMPANY_LOGO_STORE_MAX_HEIGHT,
  COMPANY_LOGO_STORE_MAX_WIDTH,
  processCompanyLogoForStorage,
} from "@/lib/companies/company-logo";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const SUBCOMPANY_LOGOS_BUCKET = "subcompany-logos";

export { COMPANY_LOGO_STORE_MAX_HEIGHT as SUBCOMPANY_LOGO_STORE_MAX_HEIGHT };
export { COMPANY_LOGO_STORE_MAX_WIDTH as SUBCOMPANY_LOGO_STORE_MAX_WIDTH };

/** True when the storage path is under `{parentCompanyId}/{subcompanyId}/` with no path traversal. */
export function isSubcompanyLogoPathOwned(
  path: string,
  parentCompanyId: string,
  subcompanyId: string,
): boolean {
  const trimmed = path.trim();
  const parent = parentCompanyId.trim();
  const sub = subcompanyId.trim();
  if (!trimmed || !parent || !sub) return false;
  if (trimmed.includes("..")) return false;
  return trimmed.startsWith(`${parent}/${sub}/`);
}

export async function processSubcompanyLogoForStorage(
  input: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  return processCompanyLogoForStorage(input, mime);
}

/** Load subcompany logo bytes for contract PDF embedding (PNG/JPEG only). */
export async function loadSubcompanyLogoForContractPdf(
  admin: Admin,
  logoStoragePath: string | null | undefined,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const path = logoStoragePath?.trim();
  if (!path) return null;

  const { data, error: dlErr } = await admin.storage.from(SUBCOMPANY_LOGOS_BUCKET).download(path);
  if (dlErr || !data) {
    console.warn("[subcompany-logo] download failed", path, dlErr?.message);
    return null;
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const lower = path.toLowerCase();
  let contentType = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (lower.endsWith(".webp")) contentType = "image/webp";

  if (contentType === "image/webp") {
    try {
      const sharp = (await import("sharp")).default;
      const png = await sharp(Buffer.from(bytes)).png().toBuffer();
      return { bytes: new Uint8Array(png), contentType: "image/png" };
    } catch (e) {
      console.warn("[subcompany-logo] webp→png failed; omitting logo from PDF", e);
      return null;
    }
  }

  return { bytes, contentType };
}

export async function createSubcompanyLogoSignedUrl(
  admin: Admin,
  logoStoragePath: string | null | undefined,
  opts: {
    parentCompanyId: string;
    subcompanyId: string;
    expiresInSeconds?: number;
  },
): Promise<string | null> {
  const path = logoStoragePath?.trim();
  if (!path) return null;
  if (!isSubcompanyLogoPathOwned(path, opts.parentCompanyId, opts.subcompanyId)) {
    console.warn("[subcompany-logo] refusing signed URL for path outside tenant folder", path);
    return null;
  }
  const { data, error } = await admin.storage
    .from(SUBCOMPANY_LOGOS_BUCKET)
    .createSignedUrl(path, opts.expiresInSeconds ?? 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
