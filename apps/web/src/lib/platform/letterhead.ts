import { APP_NAME } from "@rph/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Rental Pro Hub operator details for platform-company agreement PDF letterheads. */
export type PlatformLetterhead = {
  name: string;
  companyNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function envOrNull(key: string): string | null {
  const v = process.env[key]?.trim();
  return v || null;
}

/** Platform operator letterhead (not the rental customer). Override via env in production. */
export function getPlatformLetterhead(): PlatformLetterhead {
  return {
    name: envOrNull("RPH_PLATFORM_LEGAL_NAME") ?? APP_NAME,
    companyNumber: envOrNull("RPH_PLATFORM_COMPANY_NUMBER"),
    contactEmail: envOrNull("RPH_PLATFORM_CONTACT_EMAIL"),
    contactPhone: envOrNull("RPH_PLATFORM_CONTACT_PHONE"),
  };
}

const PLATFORM_LOGO_CANDIDATES = [
  "public/brand/platform-logo.png",
  "public/brand/platform-logo.jpg",
  "public/platform-logo.png",
];

/** Optional platform logo for contract PDFs (env path or bundled public asset). */
export async function loadPlatformLogoForContractPdf(): Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null> {
  const envPath = envOrNull("RPH_PLATFORM_LOGO_PATH");
  const candidates = envPath ? [envPath, ...PLATFORM_LOGO_CANDIDATES] : PLATFORM_LOGO_CANDIDATES;

  for (const relative of candidates) {
    const filePath = path.isAbsolute(relative) ? relative : path.join(process.cwd(), relative);
    try {
      const buffer = await readFile(filePath);
      const lower = filePath.toLowerCase();
      const contentType =
        lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : "image/png";
      return { bytes: new Uint8Array(buffer), contentType };
    } catch {
      // try next candidate
    }
  }

  return null;
}
