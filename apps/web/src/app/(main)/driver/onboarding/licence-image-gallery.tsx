"use client";

import { useEffect, useId, useRef } from "react";

export type LicenceGalleryItem = { label: string; url: string };

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
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rph-link-inline text-sm"
                  >
                    Open full size in new tab
                  </a>
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
