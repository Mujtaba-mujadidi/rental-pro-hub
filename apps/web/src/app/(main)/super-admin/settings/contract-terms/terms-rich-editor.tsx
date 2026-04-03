"use client";

import DOMPurify from "dompurify";
import { useLayoutEffect, useRef } from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalise stored body for the editor: plain text becomes simple paragraphs. */
export function bodyToEditorHtml(body: string): string {
  const t = body?.trim() ?? "";
  if (!t) return "<p><br></p>";
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  const paras = t.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return paras.join("") || "<p><br></p>";
}

const btnClass =
  "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

type EditableProps = {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

/** Remount with `key` when opening the modal for a different row. */
export function TermsRichEditor({ initialHtml, onChange, disabled }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = bodyToEditorHtml(initialHtml);
    onChange(el.innerHTML);
    // Intentionally sync HTML into parent once per initialHtml (remount via key when switching rows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  const run = (cmd: string, arg?: string) => {
    if (disabled) return;
    const el = ref.current;
    el?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignore */
    }
    onChange(el?.innerHTML ?? "");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-600 dark:bg-slate-900/80">
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}>
          Bold
        </button>
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}>
          Italic
        </button>
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("underline")}>
          Underline
        </button>
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden />
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")}>
          Bullets
        </button>
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertOrderedList")}>
          Numbered
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = typeof window !== "undefined" ? window.prompt("Link URL (https://…)", "https://") : null;
            if (url) run("createLink", url);
          }}
        >
          Link
        </button>
        <button type="button" className={btnClass} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run("removeFormat")}>
          Clear format
        </button>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        className="min-h-[220px] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-rph-rail/20 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-rph-rail-soft/30"
      />
    </div>
  );
}

export function TermsRichViewer({ html }: { html: string }) {
  const safe = DOMPurify.sanitize(bodyToEditorHtml(html), {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "ul", "ol", "li", "a", "span", "div"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
  return (
    <div
      className="max-w-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 [&_a]:text-rph-rail [&_a]:underline [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
