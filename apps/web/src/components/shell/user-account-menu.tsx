"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function UserAccountMenu({
  displayName,
  profileHref,
  profileLabel = "Profile",
}: {
  displayName: string | null;
  /** When set, first menu row links here (e.g. driver profile or super-admin home). */
  profileHref: string | null;
  profileLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const name = displayName?.trim() || "User";
  const initialGlyph = (() => {
    const t = displayName?.trim() ?? "";
    if (!t) return "?";
    const ch = t.charAt(0);
    return ch.toLocaleUpperCase("en-GB");
  })();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "block w-full px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800";

  return (
    <div ref={rootRef} className="relative border-l border-slate-200 pl-2 dark:border-slate-700 sm:pl-3">
      <button
        type="button"
        id={`${menuId}-trigger`}
        className="flex min-w-0 max-w-[200px] items-center gap-1.5 rounded-lg py-1.5 pl-2 pr-1.5 text-left outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-rph-rail/35 dark:hover:bg-slate-800 sm:max-w-[260px]"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? `${menuId}-menu` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-sm font-semibold tracking-tight text-slate-700 ring-1 ring-slate-300/60 dark:from-slate-600 dark:to-slate-700 dark:text-slate-100 dark:ring-slate-500/40"
          aria-hidden
        >
          {initialGlyph}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {name}
        </span>
        <IconChevronDown
          className={[
            "h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400",
            open ? "-rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div
          id={`${menuId}-menu`}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          {profileHref ? (
            <Link
              role="menuitem"
              href={profileHref}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {profileLabel}
            </Link>
          ) : null}
          <form
            action={signOutAction}
            className={profileHref ? "border-t border-slate-100 dark:border-slate-800" : ""}
          >
            <button type="submit" role="menuitem" className={itemClass}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
