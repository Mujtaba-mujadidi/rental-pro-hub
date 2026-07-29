"use client";

import { HireInspectionLazyImage } from "@/components/fleet/hire-inspection/hire-inspection-lazy-image";
import { HireInspectionPhotoAddMenu } from "@/components/fleet/hire-inspection/hire-inspection-photo-add-menu";
import type { HireInspectionDraftMedia } from "@/lib/fleet/hire-inspection-draft-media";
import { isLocalMediaId } from "@/lib/fleet/hire-inspection-draft-media";

type HireInspectionPhotosSectionProps = {
  hireGroupId: string;
  draftMedia: HireInspectionDraftMedia[];
  onAddPhotos: (files: FileList | null) => void;
  onRemovePhoto: (mediaId: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
};

export function HireInspectionPhotosSection({
  hireGroupId,
  draftMedia,
  onAddPhotos,
  onRemovePhoto,
  readOnly = false,
  disabled = false,
}: HireInspectionPhotosSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-rph-fg">Photos</h2>
          <p className="rph-muted mt-1 text-xs">
            Photos are kept on this device until you save draft or complete the inspection.
          </p>
        </div>
        {!readOnly ? <HireInspectionPhotoAddMenu disabled={disabled} onFiles={onAddPhotos} /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {draftMedia.map((item) => (
          <div key={item.id} className="relative overflow-hidden rounded-lg border border-rph-border">
            {item.isObjectUrl || isLocalMediaId(item.id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt="Vehicle photo"
                loading="lazy"
                decoding="async"
                className="aspect-video w-full object-cover"
              />
            ) : (
              <HireInspectionLazyImage
                hireGroupId={hireGroupId}
                mediaId={item.id}
                alt="Vehicle photo"
                eagerSrc={item.previewUrl || null}
              />
            )}
            {!readOnly ? (
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
                onClick={() => onRemovePhoto(item.id)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {!draftMedia.length ? <p className="rph-muted text-sm">No photos yet.</p> : null}
    </div>
  );
}
