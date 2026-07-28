import { describe, expect, it } from "vitest";
import {
  buildMediaDraftFormData,
  isLocalMediaId,
  mapInspectionMediaToDraft,
  newLocalMediaId,
  validateHireInspectionPhotoFile,
} from "@/lib/fleet/hire-inspection-draft-media";

describe("hire-inspection-draft-media", () => {
  it("creates and detects local media ids", () => {
    const id = newLocalMediaId();
    expect(isLocalMediaId(id)).toBe(true);
    expect(isLocalMediaId("abc")).toBe(false);
  });

  it("validates photo files", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 1024 });
    expect(validateHireInspectionPhotoFile(file)).toBeNull();

    const large = new File(["x"], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(large, "size", { value: 6 * 1024 * 1024 });
    expect(validateHireInspectionPhotoFile(large)).toContain("5 MB");
  });

  it("maps persisted media to draft rows", () => {
    const rows = mapInspectionMediaToDraft([
      {
        id: "m1",
        filePath: "path/1.jpg",
        signedUrl: "https://example.com/1.jpg",
        caption: null,
        damageId: null,
        sortOrder: 0,
      },
    ]);
    expect(rows[0]?.id).toBe("m1");
    expect(rows[0]?.isObjectUrl).toBe(false);
  });

  it("builds media sync form data", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const formData = buildMediaDraftFormData({
      hireGroupId: "g1",
      kind: "checkout",
      draftMedia: [
        {
          id: "server-1",
          previewUrl: "https://example.com/1.jpg",
          isObjectUrl: false,
          sortOrder: 0,
        },
        {
          id: newLocalMediaId(),
          previewUrl: "blob:local",
          isObjectUrl: true,
          file,
          sortOrder: 1,
        },
      ],
    });
    expect(formData.get("hireGroupId")).toBe("g1");
    expect(JSON.parse(String(formData.get("keepMediaIds")))).toEqual(["server-1"]);
    expect(formData.getAll("files")).toHaveLength(1);
  });
});
