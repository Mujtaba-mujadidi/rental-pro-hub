import { describe, expect, it } from "vitest";
import {
  VEHICLE_DOCUMENT_UPLOAD_MAX_FILE_BYTES,
  VEHICLE_DOCUMENT_UPLOAD_MAX_REQUEST_BYTES,
  validateVehicleDocumentUploadFiles,
} from "./vehicle-document-upload-limits";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("validateVehicleDocumentUploadFiles", () => {
  it("accepts files within per-file and total limits", () => {
    const result = validateVehicleDocumentUploadFiles([
      file("a.pdf", 4 * 1024 * 1024),
      file("b.pdf", 4 * 1024 * 1024),
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a single file over the per-file limit", () => {
    const result = validateVehicleDocumentUploadFiles([
      file("big.pdf", VEHICLE_DOCUMENT_UPLOAD_MAX_FILE_BYTES + 1),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("big.pdf");
      expect(result.error).toContain("12 MB");
    }
  });

  it("rejects combined files over the request limit", () => {
    const half = Math.floor(VEHICLE_DOCUMENT_UPLOAD_MAX_REQUEST_BYTES / 2) + 1;
    const result = validateVehicleDocumentUploadFiles([file("a.pdf", half), file("b.pdf", half)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("total");
      expect(result.error).toContain("12 MB");
    }
  });
});
