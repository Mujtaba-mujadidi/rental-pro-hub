"use client";

import { signHireInspectionMediaUrlAction } from "@/app/actions/hire-inspections";
import { useEffect, useRef, useState } from "react";

type HireInspectionLazyImageProps = {
  hireGroupId: string;
  mediaId: string;
  alt: string;
  className?: string;
  /** Blob or already-signed URL — skip lazy fetch. */
  eagerSrc?: string | null;
};

export function HireInspectionLazyImage({
  hireGroupId,
  mediaId,
  alt,
  className,
  eagerSrc,
}: HireInspectionLazyImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(eagerSrc?.trim() || null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (eagerSrc?.trim()) {
      setSrc(eagerSrc);
      return;
    }
    const el = ref.current;
    if (!el || src || loading || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        setLoading(true);
        void signHireInspectionMediaUrlAction(hireGroupId, mediaId).then((res) => {
          setLoading(false);
          if (!res.ok) {
            setFailed(true);
            return;
          }
          setSrc(res.signedUrl);
        });
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eagerSrc, failed, hireGroupId, loading, mediaId, src]);

  return (
    <div ref={ref} className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-rph-chrome text-xs text-rph-fg-muted">
          {loading ? "Loading…" : failed ? "Unavailable" : "Photo"}
        </div>
      )}
    </div>
  );
}
