"use client";

import { useEffect, useState } from "react";

export type PdfPageSize = { width: number; height: number };

type PdfjsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      canvas: HTMLCanvasElement;
    }) => { promise: Promise<void> };
  }>;
  destroy?: () => Promise<void>;
};

let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsModulePromise;
}

function waitForCanvases(prefix: string, pageCount: number, signal: { cancelled: boolean }) {
  return new Promise<boolean>((resolve) => {
    const tryFind = () => {
      if (signal.cancelled) {
        resolve(false);
        return true;
      }
      for (let i = 1; i <= pageCount; i++) {
        if (!document.getElementById(`${prefix}${i}`)) return false;
      }
      resolve(true);
      return true;
    };
    if (tryFind()) return;
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (tryFind() || frames > 90) {
        if (frames > 90) resolve(Boolean(document.getElementById(`${prefix}1`)));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Load a PDF into page canvases progressively (first page clears the spinner).
 * Waits for React to mount canvases after pageCount is known — fixes blank page 2+.
 */
export function usePdfPages(
  pdfUrl: string,
  canvasIdPrefix: string,
  options?: { scale?: number; onError?: (message: string) => void },
) {
  const scale = options?.scale ?? 1.15;
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<PdfPageSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    let doc: PdfjsDoc | null = null;

    setLoading(true);
    setReady(false);
    setPageCount(0);
    setPageSizes([]);

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
        doc = (await pdfjs.getDocument({ url: pdfUrl }).promise) as unknown as PdfjsDoc;
        if (cancelled) return;

        const sizes: PdfPageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });
          sizes.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;

        setPageCount(doc.numPages);
        setPageSizes(sizes);

        const canvasesReady = await waitForCanvases(canvasIdPrefix, doc.numPages, signal);
        if (cancelled || !canvasesReady) return;

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.getElementById(`${canvasIdPrefix}${i}`) as HTMLCanvasElement | null;
          if (!canvas) continue;
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
          // Unblock UI after the first page is painted
          if (i === 1 && !cancelled) {
            setLoading(false);
            setReady(true);
          }
        }
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          options?.onError?.(e instanceof Error ? e.message : "Could not load PDF.");
        }
      } finally {
        try {
          await doc?.destroy?.();
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
    // options.onError intentionally omitted (unstable parent callbacks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, canvasIdPrefix, scale]);

  return { pageCount, pageSizes, loading, ready };
}
