"use client";

import { useEffect, useId, useRef, useState } from "react";

export type LicenceGalleryItem = { label: string; url: string };

/** Tap-friendly on small screens; underline only on the label text (not the icon). */
const galleryActionBaseClass =
  "group inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-rph-rail transition-colors hover:text-rph-rail-hover focus-visible:outline focus-visible:ring-2 focus-visible:ring-rph-rail/25 dark:text-rph-rail-softer dark:hover:text-slate-300 dark:focus-visible:ring-rph-rail-soft/40 sm:min-h-0 sm:py-1.5";

const galleryActionTextClass =
  "underline decoration-rph-rail/40 underline-offset-2 group-hover:decoration-rph-rail-hover dark:group-hover:decoration-slate-400";

function OpenInNewTabIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v9.75A2.25 2.25 0 0 0 5.25 20.25h9.75A2.25 2.25 0 0 0 18 18V9.75M18 3.75h3.75V7.5M21 3.75L10.5 14.25"
      />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}

function licenceDownloadFilename(label: string, url: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fromUrl = url.match(/\.(jpe?g|png|webp)(?:\?|#|$)/i);
  const ext = fromUrl ? fromUrl[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
  return `${slug || "licence"}.${ext}`;
}

function DownloadLicenceButton({ url, filename }: { url: string; filename: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("bad response");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={`${galleryActionBaseClass} disabled:pointer-events-none disabled:opacity-50`}
    >
      <DownloadIcon className="h-4 w-4 shrink-0" />
      <span className={galleryActionTextClass}>{pending ? "Preparing…" : "Download"}</span>
    </button>
  );
}

export function LicenceImageGallery({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: LicenceGalleryItem[];
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Licence photos
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="rph-muted text-sm">No images are available to display.</p>
          ) : (
            <ul className="space-y-6">
              {items.map((item, index) => (
                <li key={item.label}>
                  <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {item.label}
                  </p>
                  <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2 sm:gap-x-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={galleryActionBaseClass}
                      aria-label="Open full size in a new browser tab"
                    >
                      <OpenInNewTabIcon className="h-4 w-4 shrink-0" />
                      <span className={galleryActionTextClass}>Open full size</span>
                    </a>
                    <span
                      className="shrink-0 select-none px-0.5 text-slate-300 dark:text-slate-600"
                      aria-hidden
                    >
                      ·
                    </span>
                    <DownloadLicenceButton
                      url={item.url}
                      filename={licenceDownloadFilename(item.label, item.url)}
                    />
                  </div>
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                    <img
                      src={item.url}
                      alt={item.label}
                      className="max-h-[50vh] w-full object-contain"
                      loading={index === 0 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index === 0 ? "high" : "low"}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
