import type { RequiredVehicleDocType } from "@/lib/fleet/vehicles";

/** Raw file size cap per file before server-side PDF compression. */
export const VEHICLE_DOCUMENT_UPLOAD_MAX_FILE_BYTES = 12 * 1024 * 1024;

/** Total raw bytes per upload request (all files in one server action). */
export const VEHICLE_DOCUMENT_UPLOAD_MAX_REQUEST_BYTES = 12 * 1024 * 1024;

export const VEHICLE_DOCUMENT_UPLOAD_MAX_LABEL = "12 MB";

export type VehicleDocUploadErrors = Partial<Record<RequiredVehicleDocType, string>>;

export function nextVehicleDocUploadErrors(
  prev: VehicleDocUploadErrors,
  docType: RequiredVehicleDocType,
  message: string | null,
): VehicleDocUploadErrors {
  if (!message) {
    if (!prev[docType]) return prev;
    const next = { ...prev };
    delete next[docType];
    return next;
  }
  return { ...prev, [docType]: message };
}

export function formatVehicleDocumentUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, "")} MB`;
}

export function validateVehicleDocumentUploadFiles(
  files: readonly File[],
): { ok: true } | { ok: false; error: string } {
  if (!files.length) return { ok: false, error: "Choose at least one file." };

  let totalBytes = 0;
  for (const file of files) {
    if (file.size > VEHICLE_DOCUMENT_UPLOAD_MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `${file.name || "A file"} is ${formatVehicleDocumentUploadBytes(file.size)}. Each file must be ${VEHICLE_DOCUMENT_UPLOAD_MAX_LABEL} or less before compression.`,
      };
    }
    totalBytes += file.size;
  }

  if (totalBytes > VEHICLE_DOCUMENT_UPLOAD_MAX_REQUEST_BYTES) {
    return {
      ok: false,
      error: `These files total ${formatVehicleDocumentUploadBytes(totalBytes)}. Keep each upload to ${VEHICLE_DOCUMENT_UPLOAD_MAX_LABEL} or less (use fewer or smaller files).`,
    };
  }

  return { ok: true };
}
