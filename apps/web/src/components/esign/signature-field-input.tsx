"use client";

import { useEffect, useRef, useState } from "react";

function isCanvasBlank(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function loadImageToCanvas(canvas: HTMLCanvasElement, dataUrl: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  };
  img.src = dataUrl;
}

export function SignatureFieldInput({
  savedSignatureDataUrl,
  onChange,
  onSaveForFutureChange,
  autoFocus,
}: {
  savedSignatureDataUrl?: string | null;
  onChange: (dataUrl: string | null) => void;
  onSaveForFutureChange?: (save: boolean) => void;
  autoFocus?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [useSaved, setUseSaved] = useState(Boolean(savedSignatureDataUrl));
  const [saveForFuture, setSaveForFuture] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (autoFocus) canvas.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (useSaved && savedSignatureDataUrl) {
      const canvas = canvasRef.current;
      if (canvas) {
        loadImageToCanvas(canvas, savedSignatureDataUrl);
        onChange(savedSignatureDataUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to saved-sig toggle
  }, [useSaved, savedSignatureDataUrl]);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  }

  function emitValue() {
    const canvas = canvasRef.current;
    onChange(canvas && !isCanvasBlank(canvas) ? canvas.toDataURL("image/png") : null);
  }

  return (
    <div className="space-y-2">
      {savedSignatureDataUrl ? (
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={useSaved}
            onChange={(e) => {
              setUseSaved(e.target.checked);
              if (!e.target.checked) {
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (canvas && ctx) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  onChange(null);
                }
              }
            }}
          />
          Use saved signature
        </label>
      ) : null}
      <canvas
        ref={canvasRef}
        width={480}
        height={140}
        tabIndex={0}
        className={`h-[120px] w-full touch-none rounded-lg border border-slate-300 bg-white dark:border-slate-600 ${
          useSaved && savedSignatureDataUrl ? "pointer-events-none opacity-90" : ""
        }`}
        onPointerDown={(e) => {
          if (useSaved && savedSignatureDataUrl) return;
          drawing.current = true;
          setUseSaved(false);
          const ctx = canvasRef.current?.getContext("2d");
          const p = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || (useSaved && savedSignatureDataUrl)) return;
          const ctx = canvasRef.current?.getContext("2d");
          const p = pos(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          emitValue();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="text-xs text-slate-600 underline dark:text-slate-300"
          onClick={() => {
            setUseSaved(false);
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              onChange(null);
            }
          }}
        >
          Clear
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={saveForFuture}
            onChange={(e) => {
              setSaveForFuture(e.target.checked);
              onSaveForFutureChange?.(e.target.checked);
            }}
          />
          Save signature for future use
        </label>
      </div>
    </div>
  );
}
