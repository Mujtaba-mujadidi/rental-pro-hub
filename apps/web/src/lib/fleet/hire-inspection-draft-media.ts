import type { HireInspectionMediaItem } from "@/app/actions/hire-inspections";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type HireInspectionDraftMedia = {
  id: string;
  previewUrl: string;
  isObjectUrl: boolean;
  file?: File;
  sortOrder: number;
};

export function newLocalMediaId(): string {
  return `local:${crypto.randomUUID()}`;
}

export function isLocalMediaId(id: string): boolean {
  return id.startsWith("local:");
}

export function validateHireInspectionPhotoFile(file: File): string | null {
  if (file.size === 0) return "Choose a photo to upload.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller.";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "Use JPEG, PNG, or WebP images.";
  return null;
}

export function mapInspectionMediaToDraft(media: HireInspectionMediaItem[]): HireInspectionDraftMedia[] {
  return media.map((item, index) => ({
    id: item.id,
    previewUrl: item.signedUrl ?? "",
    isObjectUrl: false,
    sortOrder: item.sortOrder ?? index,
  }));
}

export function createDraftMediaFromFiles(files: File[]): {
  items: HireInspectionDraftMedia[];
  error: string | null;
} {
  const items: HireInspectionDraftMedia[] = [];
  for (const file of files) {
    const validationError = validateHireInspectionPhotoFile(file);
    if (validationError) return { items: [], error: validationError };
    items.push({
      id: newLocalMediaId(),
      previewUrl: URL.createObjectURL(file),
      isObjectUrl: true,
      file,
      sortOrder: 0,
    });
  }
  return { items, error: null };
}

export function revokeDraftMediaUrls(media: HireInspectionDraftMedia[]): void {
  for (const item of media) {
    if (item.isObjectUrl && item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

export function buildMediaDraftFormData(input: {
  hireGroupId: string;
  kind: string;
  draftMedia: HireInspectionDraftMedia[];
}): FormData {
  const formData = new FormData();
  formData.set("hireGroupId", input.hireGroupId);
  formData.set("kind", input.kind);

  const keepMediaIds: string[] = [];
  for (const item of input.draftMedia) {
    if (isLocalMediaId(item.id)) {
      if (item.file) formData.append("files", item.file);
    } else {
      keepMediaIds.push(item.id);
    }
  }
  formData.set("keepMediaIds", JSON.stringify(keepMediaIds));
  return formData;
}
