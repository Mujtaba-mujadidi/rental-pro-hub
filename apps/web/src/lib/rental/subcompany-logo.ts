import {
  COMPANY_LOGO_STORE_MAX_HEIGHT,
  COMPANY_LOGO_STORE_MAX_WIDTH,
  isCompanyLogoPathOwned,
  processCompanyLogoForStorage,
  resolveCompanyLogoDisplayUrl,
} from "@/lib/companies/company-logo";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const SUBCOMPANY_LOGOS_BUCKET = "subcompany-logos";

export { COMPANY_LOGO_STORE_MAX_HEIGHT as SUBCOMPANY_LOGO_STORE_MAX_HEIGHT };
export { COMPANY_LOGO_STORE_MAX_WIDTH as SUBCOMPANY_LOGO_STORE_MAX_WIDTH };

export type SubcompanyLogoStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export function normalizeSubcompanyLogoStoragePath(path: string | null | undefined): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, "");
}

/** True when the storage path is under `{parentCompanyId}/{subcompanyId}/` with no path traversal. */
export function isSubcompanyLogoPathOwned(
  path: string,
  parentCompanyId: string,
  subcompanyId: string,
): boolean {
  const normalized = normalizeSubcompanyLogoStoragePath(path);
  const parent = parentCompanyId.trim();
  const sub = subcompanyId.trim();
  if (!normalized || !parent || !sub) return false;
  if (normalized.includes("..")) return false;
  return normalized.toLowerCase().startsWith(`${parent}/${sub}/`.toLowerCase());
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
  const path = normalizeSubcompanyLogoStoragePath(logoStoragePath);
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

export async function createSubcompanyLogoSignedUrlForSession(
  supabase: SubcompanyLogoStorageClient,
  logoStoragePath: string | null | undefined,
  opts: {
    parentCompanyId: string;
    subcompanyId: string;
    expiresInSeconds?: number;
  },
): Promise<string | null> {
  const path = normalizeSubcompanyLogoStoragePath(logoStoragePath);
  if (!path) return null;
  if (!isSubcompanyLogoPathOwned(path, opts.parentCompanyId, opts.subcompanyId)) {
    console.warn("[subcompany-logo] refusing signed URL for path outside tenant folder", path);
    return null;
  }
  const { data, error } = await supabase.storage
    .from(SUBCOMPANY_LOGOS_BUCKET)
    .createSignedUrl(path, opts.expiresInSeconds ?? 3600);
  if (error || !data?.signedUrl) {
    console.warn("[subcompany-logo] session signed URL failed", path, error?.message);
    return null;
  }
  return data.signedUrl;
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
  const path = normalizeSubcompanyLogoStoragePath(logoStoragePath);
  if (!path) return null;
  if (!isSubcompanyLogoPathOwned(path, opts.parentCompanyId, opts.subcompanyId)) {
    console.warn("[subcompany-logo] refusing signed URL for path outside tenant folder", path);
    return null;
  }
  const { data, error } = await admin.storage
    .from(SUBCOMPANY_LOGOS_BUCKET)
    .createSignedUrl(path, opts.expiresInSeconds ?? 3600);
  if (error || !data?.signedUrl) {
    console.warn("[subcompany-logo] admin signed URL failed", path, error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Prefer the authenticated session client (storage RLS); fall back to service role when available. */
export async function resolveSubcompanyLogoDisplayUrl(
  supabase: SubcompanyLogoStorageClient,
  logoStoragePath: string | null | undefined,
  opts: {
    parentCompanyId: string;
    subcompanyId: string;
    expiresInSeconds?: number;
  },
  admin?: Admin | null,
): Promise<string | null> {
  const fromSession = await createSubcompanyLogoSignedUrlForSession(supabase, logoStoragePath, opts);
  if (fromSession) return fromSession;
  if (!admin) return null;
  try {
    return await createSubcompanyLogoSignedUrl(admin, logoStoragePath, opts);
  } catch {
    return null;
  }
}

/**
 * Resolve a logo preview for the subcompany workspace.
 * Primary subcompanies may still use the parent company logo from onboarding (`company-logos`).
 */
export async function resolveSubcompanyWorkspaceLogoDisplayUrl(
  supabase: SubcompanyLogoStorageClient,
  input: {
    subcompanyLogoPath: string | null | undefined;
    companyLogoPath: string | null | undefined;
    parentCompanyId: string;
    subcompanyId: string;
    expiresInSeconds?: number;
  },
  admin?: Admin | null,
): Promise<string | null> {
  const opts = {
    parentCompanyId: input.parentCompanyId,
    subcompanyId: input.subcompanyId,
    expiresInSeconds: input.expiresInSeconds,
  };
  const subPath = normalizeSubcompanyLogoStoragePath(input.subcompanyLogoPath);
  if (subPath) {
    if (isSubcompanyLogoPathOwned(subPath, input.parentCompanyId, input.subcompanyId)) {
      const subUrl = await resolveSubcompanyLogoDisplayUrl(supabase, subPath, opts, admin);
      if (subUrl) return subUrl;
    } else if (isCompanyLogoPathOwned(subPath, input.parentCompanyId)) {
      const companyUrl = await resolveCompanyLogoDisplayUrl(
        supabase,
        subPath,
        input.parentCompanyId,
        admin,
        input.expiresInSeconds,
      );
      if (companyUrl) return companyUrl;
    }
  }

  if (!input.companyLogoPath) return null;
  return resolveCompanyLogoDisplayUrl(
    supabase,
    input.companyLogoPath,
    input.parentCompanyId,
    admin,
    input.expiresInSeconds,
  );
}
