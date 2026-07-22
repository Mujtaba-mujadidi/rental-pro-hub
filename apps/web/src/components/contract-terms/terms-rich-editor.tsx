"use client";

import DOMPurify from "isomorphic-dompurify";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

type FormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
};

const EMPTY_FORMAT: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
};

const btnBase =
  "rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const btnIdle =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const btnActive =
  "border-rph-rail/40 bg-rph-rail/15 text-rph-rail dark:border-rph-rail-soft/50 dark:bg-rph-rail-soft/20 dark:text-rph-rail-soft";

const editorContentClass =
  "min-h-[220px] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-rph-rail/20 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-rph-rail-soft/30 [&_a]:text-rph-rail [&_a]:underline [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6";

type EditableProps = {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Taller editing area (e.g. maximised modal). */
  expanded?: boolean;
};

/** Remount with `key` when opening the modal for a different row. */
export function TermsRichEditor({ initialHtml, onChange, disabled, expanded }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [formats, setFormats] = useState<FormatState>(EMPTY_FORMAT);

  const readFormats = useCallback((): FormatState => {
    const el = ref.current;
    if (!el || disabled) return EMPTY_FORMAT;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return EMPTY_FORMAT;
    if (!el.contains(sel.anchorNode) && !el.contains(sel.focusNode)) return EMPTY_FORMAT;
    try {
      return {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        unorderedList: document.queryCommandState("insertUnorderedList"),
        orderedList: document.queryCommandState("insertOrderedList"),
      };
    } catch {
      return EMPTY_FORMAT;
    }
  }, [disabled]);

  const syncFormats = useCallback(() => {
    setFormats(readFormats());
  }, [readFormats]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = bodyToEditorHtml(initialHtml);
    onChange(el.innerHTML);
    // Intentionally sync HTML into parent once per initialHtml (remount via key when switching rows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    const onSelectionChange = () => syncFormats();
    document.addEventListener("selectionchange", onSelectionChange);
    el.addEventListener("keyup", onSelectionChange);
    el.addEventListener("mouseup", onSelectionChange);
    el.addEventListener("focus", onSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      el.removeEventListener("keyup", onSelectionChange);
      el.removeEventListener("mouseup", onSelectionChange);
      el.removeEventListener("focus", onSelectionChange);
    };
  }, [disabled, syncFormats]);

  const run = (cmd: string, arg?: string) => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    el.focus();

    try {
      if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
        document.execCommand("defaultParagraphSeparator", false, "p");
      }
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignore */
    }

    onChange(el.innerHTML);
    syncFormats();
  };

  function btnClass(active: boolean) {
    return `${btnBase} ${active ? btnActive : btnIdle}`;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-600 dark:bg-slate-900/80">
        <button
          type="button"
          className={btnClass(formats.bold)}
          disabled={disabled}
          aria-pressed={formats.bold}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          className={btnClass(formats.italic)}
          disabled={disabled}
          aria-pressed={formats.italic}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("italic")}
        >
          Italic
        </button>
        <button
          type="button"
          className={btnClass(formats.underline)}
          disabled={disabled}
          aria-pressed={formats.underline}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("underline")}
        >
          Underline
        </button>
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden />
        <button
          type="button"
          className={btnClass(formats.unorderedList)}
          disabled={disabled}
          aria-pressed={formats.unorderedList}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("insertUnorderedList")}
        >
          Bullets
        </button>
        <button
          type="button"
          className={btnClass(formats.orderedList)}
          disabled={disabled}
          aria-pressed={formats.orderedList}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("insertOrderedList")}
        >
          Numbered
        </button>
        <button
          type="button"
          className={btnClass(false)}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = typeof window !== "undefined" ? window.prompt("Link URL (https://…)", "https://") : null;
            if (url) run("createLink", url);
          }}
        >
          Link
        </button>
        <button
          type="button"
          className={btnClass(false)}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("removeFormat")}
        >
          Clear format
        </button>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onInput={() => {
          onChange(ref.current?.innerHTML ?? "");
          syncFormats();
        }}
        className={`${editorContentClass} ${expanded ? "min-h-[min(50vh,28rem)]" : ""}`}
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
      className="max-w-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 [&_a]:text-rph-rail [&_a]:underline [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
