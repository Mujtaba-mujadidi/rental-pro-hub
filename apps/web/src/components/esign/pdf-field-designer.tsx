"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EsignFieldLayoutItem, EsignFieldType } from "@/lib/esign/types";
import { ESIGN_OWNER_ROLE, ESIGN_RECIPIENT_ROLE } from "@/lib/esign/types";
import { normalizeFieldRole } from "@/lib/esign/roles";
import { usePdfPages } from "@/components/esign/use-pdf-pages";

type DragState =
  | {
      kind: "move";
      id: string;
      page: number;
      grabX: number;
      grabY: number;
    }
  | {
      kind: "resize";
      id: string;
      page: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      originClientX: number;
      originClientY: number;
    };

const FIELD_META: Record<
  EsignFieldType,
  { label: string; hint: string; w: number; h: number; color: string; border: string; bg: string }
> = {
  signature: {
    label: "Signature",
    hint: "Signer draws their name",
    w: 0.28,
    h: 0.06,
    color: "text-amber-950",
    border: "border-amber-500",
    bg: "bg-amber-400/35",
  },
  date: {
    label: "Date & time signed",
    hint: "Auto-filled with date and time",
    w: 0.22,
    h: 0.035,
    color: "text-emerald-950",
    border: "border-emerald-500",
    bg: "bg-emerald-400/35",
  },
  text: {
    label: "Text",
    hint: "Free text field",
    w: 0.22,
    h: 0.035,
    color: "text-sky-950",
    border: "border-sky-500",
    bg: "bg-sky-400/35",
  },
};

function uid() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function PdfFieldDesigner({
  pdfUrl,
  initialFields,
  onSave,
  onSend,
  onAfterSendSuccess,
  disabled,
  canSend = true,
  allowOwnerFields = true,
  onLoadingChange,
}: {
  pdfUrl: string;
  initialFields: EsignFieldLayoutItem[];
  onSave: (fields: EsignFieldLayoutItem[]) => Promise<void>;
  onSend: () => Promise<void>;
  /** Called after a successful send (e.g. refresh to awaiting view). */
  onAfterSendSuccess?: () => void;
  disabled?: boolean;
  /** When false, Send is hidden/disabled (e.g. owner must sign first). */
  canSend?: boolean;
  /** When false (recipient-only mode), owner field placement is hidden. */
  allowOwnerFields?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [fields, setFields] = useState<EsignFieldLayoutItem[]>(initialFields);
  const [tool, setTool] = useState<EsignFieldType | null>("signature");
  const [fieldParty, setFieldParty] = useState<typeof ESIGN_OWNER_ROLE | typeof ESIGN_RECIPIENT_ROLE>(
    ESIGN_RECIPIENT_ROLE,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendPhase, setSendPhase] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const { pageCount, pageSizes, loading: pdfLoading } = usePdfPages(pdfUrl, "esign-page-", {
    scale: 1.15,
    onError: (message) => setError(message),
  });

  useEffect(() => {
    onLoadingChange?.(pdfLoading);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent callback may be unstable
  }, [pdfLoading]);

  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  useEffect(() => {
    if (!allowOwnerFields && fieldParty === ESIGN_OWNER_ROLE) {
      setFieldParty(ESIGN_RECIPIENT_ROLE);
    }
  }, [allowOwnerFields, fieldParty]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled || busy) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setFields((prev) => prev.filter((f) => f.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setTool(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, disabled, selectedId]);

  const placeField = useCallback(
    (page: number, xNorm: number, yNorm: number, type: EsignFieldType) => {
      if (disabled) return;
      const meta = FIELD_META[type];
      const x = clamp(xNorm - meta.w / 2, 0, 1 - meta.w);
      const y = clamp(yNorm - meta.h / 2, 0, 1 - meta.h);
      const id = uid();
      setFields((prev) => [
        ...prev,
        {
          id,
          type,
          role: fieldParty,
          page,
          x,
          y,
          w: meta.w,
          h: meta.h,
          label: meta.label,
        },
      ]);
      setSelectedId(id);
    },
    [disabled, fieldParty],
  );

  const clientToNorm = useCallback((page: number, clientX: number, clientY: number) => {
    const el = containerRefs.current[page - 1];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
      rect,
    };
  }, []);

  const onPageClick = useCallback(
    (page: number, clientX: number, clientY: number) => {
      if (disabled || busy) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (!tool) {
        setSelectedId(null);
        return;
      }
      const norm = clientToNorm(page, clientX, clientY);
      if (!norm) return;
      placeField(page, norm.x, norm.y, tool);
    },
    [busy, clientToNorm, disabled, placeField, tool],
  );

  const onPageDrop = useCallback(
    (page: number, e: React.DragEvent) => {
      e.preventDefault();
      if (disabled || busy) return;
      const type = e.dataTransfer.getData("application/x-esign-field") as EsignFieldType;
      if (!type || !FIELD_META[type]) return;
      const norm = clientToNorm(page, e.clientX, e.clientY);
      if (!norm) return;
      placeField(page, norm.x, norm.y, type);
      setTool(type);
    },
    [busy, clientToNorm, disabled, placeField],
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const norm = clientToNorm(drag.page, clientX, clientY);
      if (!norm) return;

      if (drag.kind === "move") {
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== drag.id) return f;
            return {
              ...f,
              x: clamp(norm.x - drag.grabX, 0, 1 - f.w),
              y: clamp(norm.y - drag.grabY, 0, 1 - f.h),
            };
          }),
        );
        return;
      }

      const el = containerRefs.current[drag.page - 1];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (clientX - drag.originClientX) / rect.width;
      const dy = (clientY - drag.originClientY) / rect.height;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== drag.id) return f;
          const w = clamp(drag.startW + dx, 0.08, 1 - drag.startX);
          const h = clamp(drag.startH + dy, 0.025, 1 - drag.startY);
          return { ...f, w, h };
        }),
      );
    },
    [clientToNorm],
  );

  const endDrag = useCallback(() => {
    if (dragRef.current) {
      suppressClickRef.current = true;
      dragRef.current = null;
    }
  }, []);

  const beginPointerDrag = useCallback(
    (drag: DragState) => {
      dragRef.current = drag;
      const onMove = (e: PointerEvent) => updateDrag(e.clientX, e.clientY);
      const onUp = () => {
        endDrag();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [endDrag, updateDrag],
  );

  async function handleSave() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await onSave(fields);
      setOk("Field layout saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    setBusy(true);
    setSendPhase("sending");
    setError(null);
    setOk(null);
    let finished = false;
    const failsafe = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      setSendPhase("error");
      setError(
        "Sending is taking too long. The email server may be unreachable — check SMTP settings on Railway and try again.",
      );
      setBusy(false);
    }, 45_000);
    try {
      if (!disabled) {
        await onSave(fields);
      }
      await onSend();
      if (finished) return;
      finished = true;
      setSendPhase("success");
      setOk("Contract sent. The recipient will receive an email with a signing link and access code.");
      onAfterSendSuccess?.();
    } catch (e) {
      if (finished) return;
      finished = true;
      setSendPhase("error");
      setError(e instanceof Error ? e.message : "Send failed. Please try again.");
    } finally {
      window.clearTimeout(failsafe);
      setBusy(false);
    }
  }

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const canEdit = !disabled && !busy && sendPhase !== "sending" && sendPhase !== "success";
  const canClickSend = canSend && !busy && sendPhase !== "sending" && sendPhase !== "success";

  return (
    <div className="relative flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      {sendPhase === "sending" || sendPhase === "success" || sendPhase === "error" ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-white/95 px-6 dark:bg-slate-950/95">
          {sendPhase === "sending" ? (
            <>
              <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail" />
              <div className="max-w-sm text-center">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  Sending contract for signature…
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Saving the layout and emailing the recipient. Please wait.
                </p>
              </div>
            </>
          ) : null}
          {sendPhase === "success" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="text-xl font-bold" aria-hidden>
                  ✓
                </span>
              </div>
              <div className="max-w-sm text-center">
                <p className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
                  Contract sent successfully
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  The recipient will receive an email with a signing link and access code.
                </p>
              </div>
            </>
          ) : null}
          {sendPhase === "error" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                <span className="text-xl font-bold" aria-hidden>
                  !
                </span>
              </div>
              <div className="max-w-sm text-center">
                <p className="text-base font-semibold text-red-800 dark:text-red-200">
                  Couldn’t send the contract
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {error ?? "Something went wrong. Please try again."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSendPhase("idle");
                  setError(null);
                }}
                className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white"
              >
                Dismiss and try again
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            Place fields on the document
          </p>
          <p className="text-xs text-slate-500">
            Drag a field from the right onto the PDF, or select a type then click the page. Drag placed
            fields to move them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error && sendPhase === "idle" ? (
            <span className="max-w-xs truncate text-xs text-red-600">{error}</span>
          ) : null}
          {ok && sendPhase === "idle" ? (
            <span className="max-w-xs truncate text-xs text-emerald-700 dark:text-emerald-300">{ok}</span>
          ) : null}
          {disabled ? (
            <span className="text-xs text-slate-500" title="Field positions are locked after the owner signs">
              Layout locked
            </span>
          ) : (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => void handleSave()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              {busy && sendPhase === "idle" ? "Saving…" : "Save layout"}
            </button>
          )}
          <button
            type="button"
            disabled={!canClickSend}
            onClick={() => void handleSend()}
            className="rounded-lg bg-rph-rail px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            title={!canSend ? "Sign as contract owner before sending" : undefined}
          >
            {sendPhase === "sending" ? "Sending…" : "Send to recipient"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Document canvas */}
        <div className="relative min-w-0 flex-1 overflow-auto bg-slate-300/80 dark:bg-slate-800">
          {pdfLoading ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-300/90 dark:bg-slate-800/90">
              <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading contract PDF…</p>
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 px-4 py-8 sm:px-8">
            {Array.from({ length: Math.max(pageCount, 1) }, (_, i) => i + 1).map((page) => (
              <div key={page} className="w-full max-w-[720px]">
                <div
                  ref={(el) => {
                    containerRefs.current[page - 1] = el;
                  }}
                  className={`relative mx-auto w-fit touch-none shadow-lg ring-1 ring-black/10 ${
                    tool && canEdit ? "cursor-crosshair" : "cursor-default"
                  }`}
                  onClick={(e) => onPageClick(page, e.clientX, e.clientY)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(e) => onPageDrop(page, e)}
                >
                  <canvas id={`esign-page-${page}`} className="block max-w-full bg-white" />
                  {fields
                    .filter((f) => f.page === page)
                    .map((f) => {
                      const meta = FIELD_META[f.type];
                      const isSelected = f.id === selectedId;
                      return (
                        <div
                          key={f.id}
                          role="button"
                          tabIndex={0}
                          className={`absolute box-border select-none border-2 ${meta.border} ${meta.bg} ${meta.color} ${
                            isSelected ? "z-20 ring-2 ring-rph-rail ring-offset-1" : "z-10"
                          } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                          style={{
                            left: `${f.x * 100}%`,
                            top: `${f.y * 100}%`,
                            width: `${f.w * 100}%`,
                            height: `${f.h * 100}%`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(f.id);
                            setTool(null);
                          }}
                          onPointerDown={(e) => {
                            if (!canEdit) return;
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedId(f.id);
                            setTool(null);
                            const norm = clientToNorm(page, e.clientX, e.clientY);
                            if (!norm) return;
                            beginPointerDrag({
                              kind: "move",
                              id: f.id,
                              page,
                              grabX: norm.x - f.x,
                              grabY: norm.y - f.y,
                            });
                          }}
                        >
                          <div className="flex h-full items-center justify-between gap-1 overflow-hidden px-1.5 text-[10px] font-semibold uppercase tracking-wide">
                            <span className="truncate">
                              {normalizeFieldRole(f.role) === ESIGN_OWNER_ROLE ? "Owner · " : "Recipient · "}
                              {f.label ?? meta.label}
                            </span>
                            {isSelected && canEdit ? (
                              <button
                                type="button"
                                className="shrink-0 rounded bg-white/80 px-1 text-[11px] leading-none text-slate-700 hover:bg-white"
                                title="Remove field"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFields((prev) => prev.filter((x) => x.id !== f.id));
                                  setSelectedId(null);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                          {isSelected && canEdit ? (
                            <span
                              className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm border border-white bg-rph-rail"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                beginPointerDrag({
                                  kind: "resize",
                                  id: f.id,
                                  page,
                                  startX: f.x,
                                  startY: f.y,
                                  startW: f.w,
                                  startH: f.h,
                                  originClientX: e.clientX,
                                  originClientY: e.clientY,
                                });
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                </div>
                <p className="mt-2 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                  Page {page}
                  {pageSizes[page - 1]
                    ? ` · ${Math.round(pageSizes[page - 1]!.width)}×${Math.round(pageSizes[page - 1]!.height)}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Always-visible place-fields rail */}
        <aside className="flex w-56 shrink-0 flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/90 sm:w-64">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Place fields for</h2>
            {allowOwnerFields ? (
              <div className="mt-2 flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
                {([ESIGN_OWNER_ROLE, ESIGN_RECIPIENT_ROLE] as const).map((party) => (
                  <button
                    key={party}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setFieldParty(party)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize ${
                      fieldParty === party
                        ? "bg-rph-rail text-white"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {party}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Recipient only
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Drag onto the PDF or select then click.</p>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {(["signature", "date", "text"] as EsignFieldType[]).map((t) => {
              const meta = FIELD_META[t];
              const active = tool === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!canEdit}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-esign-field", t);
                    e.dataTransfer.effectAllowed = "copy";
                    setTool(t);
                  }}
                  onClick={() => setTool((prev) => (prev === t ? null : t))}
                  className={`flex cursor-grab flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-3 text-left transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? `${meta.border} ${meta.bg} ring-2 ring-rph-rail/40`
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-950"
                  }`}
                >
                  <span className={`text-sm font-semibold ${active ? meta.color : "text-slate-800 dark:text-slate-100"}`}>
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-slate-500">{meta.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700">
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {fields.length} field{fields.length === 1 ? "" : "s"} placed
            </p>
            {selected ? (
              <p className="mt-1">
                Selected: <span className="font-medium text-slate-800 dark:text-slate-100">{selected.label ?? selected.type}</span>
                <button
                  type="button"
                  disabled={!canEdit}
                  className="ml-2 text-red-600 underline disabled:opacity-50"
                  onClick={() => {
                    setFields((prev) => prev.filter((f) => f.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  Remove
                </button>
              </p>
            ) : (
              <p className="mt-1">Press Delete to remove a selected field.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
