"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  isSubcompanyWorkspaceNavItemActive,
  parseSubcompanyWorkspaceSection,
  subcompanyWorkspaceHref,
  subcompanyWorkspaceNav,
} from "@/lib/rental/subcompany-workspace-nav";
import type { SubcompanySwitcherOption } from "@/app/actions/rental-subcompany-workspace";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";
import { SubcompanyStatusChip } from "./subcompany-status-chip";

export function SubcompanyWorkspaceTopBar({
  subcompanies,
}: {
  subcompanies: SubcompanySwitcherOption[];
}) {
  const { shell } = useSubcompanyWorkspace();
  const subcompany = shell.subcompany;
  const pathname = usePathname();
  const router = useRouter();
  const section = parseSubcompanyWorkspaceSection(pathname, subcompany.id);
  const items = subcompanyWorkspaceNav(subcompany.id);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subcompanies;
    return subcompanies.filter((s) => s.name.toLowerCase().includes(q));
  }, [subcompanies, query]);

  function switchTo(id: string) {
    setOpen(false);
    setQuery("");
    if (id === subcompany.id) return;
    router.push(subcompanyWorkspaceHref(id, section));
  }

  return (
    <div className="rph-chrome -mx-3 -mt-3 mb-5 border-b px-3 py-2.5">
      {/* Row 1: back + subcompany switcher (+ status on sm+) */}
      <div className="flex items-center gap-2">
        <Link
          href="/rental/subcompany"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
          aria-label="Back to subcompanies"
        >
          <IconArrowLeft className="h-3.5 w-3.5 shrink-0" />
          Subcompanies
        </Link>

        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none" ref={rootRef}>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-left text-sm shadow-sm"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="min-w-0 truncate">
              <span className="font-semibold text-rph-fg">{subcompany.name}</span>
              {subcompany.is_primary ? <span className="text-rph-fg-muted"> · Main</span> : null}
            </span>
            <span className="shrink-0 text-xs text-rph-fg-muted" aria-hidden>
              ▾
            </span>
          </button>

          {open ? (
            <div className="absolute left-0 right-0 z-40 mt-1 max-h-[min(70vh,24rem)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg sm:right-auto sm:w-[min(100vw-2rem,20rem)]">
              <div className="border-b border-rph-border p-2">
                <input
                  ref={inputRef}
                  className="rph-input py-1.5"
                  placeholder="Search subcompanies…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ul className="max-h-64 overflow-y-auto overscroll-contain py-1" role="listbox">
                {!filtered.length ? (
                  <li className="px-3 py-2 text-sm text-rph-fg-muted">No subcompanies match.</li>
                ) : (
                  filtered.map((s) => {
                    const active = s.id === subcompany.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={[
                            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm sm:py-2",
                            active ? "bg-rph-rail/10 text-rph-link" : "text-rph-fg hover:bg-rph-chrome",
                          ].join(" ")}
                          onClick={() => switchTo(s.id)}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{s.name}</span>
                            {s.isPrimary ? <span className="text-rph-fg-muted"> · Main</span> : null}
                          </span>
                          <SubcompanyStatusChip status={s.status} />
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <SubcompanyStatusChip status={subcompany.status} />
          <span className="max-w-[8rem] truncate text-xs font-medium text-rph-fg-muted lg:max-w-[12rem]">
            {subcompany.company_number ?? "No company number"}
          </span>
        </div>
      </div>

      {/* Row 2: section pills — Staff leaves the workspace */}
      <nav
        className="-mx-3 mt-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Subcompany sections"
      >
        <div className="flex w-max gap-1 pb-0.5">
          {items.map((item) => {
            const active = isSubcompanyWorkspaceNavItemActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} className={active ? "rph-pill-active" : "rph-pill"}>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile-only status under nav */}
      <div className="mt-2 flex items-center gap-2 sm:hidden">
        <SubcompanyStatusChip status={subcompany.status} />
        <span className="min-w-0 truncate text-xs font-medium text-rph-fg-muted">
          {subcompany.company_number ?? "No company number"}
        </span>
      </div>
    </div>
  );
}

function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}
