"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { HireSwitcherOption } from "@/lib/fleet/load-hire-workspace-shell";
import {
  hireWorkspaceHref,
  hireWorkspaceNav,
  isHireWorkspaceNavItemActive,
  parseHireWorkspaceSection,
} from "@/lib/fleet/hire-workspace-nav";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireWorkspaceTopBar({ hires }: { hires: HireSwitcherOption[] }) {
  const { shell } = useHireWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const section = parseHireWorkspaceSection(pathname, shell.hireGroupId);
  const items = hireWorkspaceNav(shell.hireGroupId);

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
    if (!q) return hires;
    return hires.filter(
      (h) =>
        h.vehicleVrm.toLowerCase().includes(q) ||
        (h.driverLabel ?? "").toLowerCase().includes(q) ||
        h.status.toLowerCase().includes(q),
    );
  }, [hires, query]);

  function switchTo(id: string) {
    setOpen(false);
    setQuery("");
    if (id === shell.hireGroupId) return;
    router.push(hireWorkspaceHref(id, section));
  }

  const statusTone = driverHireStatusTone(shell.status);

  return (
    <div className="rph-chrome -mx-3 -mt-3 mb-5 border-b px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Link
          href="/rental/hires"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
        >
          ← Hires
        </Link>

        <div className="relative min-w-0 flex-1 sm:max-w-md sm:flex-none" ref={rootRef}>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-left text-sm shadow-sm"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold text-rph-fg">{shell.vehicleVrm}</span>
              {shell.driverLabel ? (
                <span className="text-rph-fg-muted"> · {shell.driverLabel}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-rph-fg-muted">▾</span>
          </button>

          {open ? (
            <div className="absolute left-0 right-0 z-40 mt-1 max-h-[min(70vh,24rem)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg sm:w-[min(100vw-2rem,22rem)]">
              <div className="border-b border-rph-border p-2">
                <input
                  ref={inputRef}
                  className="rph-input py-1.5"
                  placeholder="Search VRM, driver…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {filtered.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-rph-chrome"
                      onClick={() => switchTo(h.id)}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-semibold">{h.vehicleVrm}</span>
                        {h.driverLabel ? (
                          <span className="text-rph-fg-muted"> · {h.driverLabel}</span>
                        ) : null}
                      </span>
                      <span className="rph-meta text-xs capitalize">{h.status.replace(/_/g, " ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <span
          className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex ${hireTableStatusToneClass(statusTone)}`}
        >
          {shell.statusLabel}
        </span>
      </div>

      <nav
        className="-mx-3 mt-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Hire sections"
      >
        <div className="flex w-max gap-1 pb-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isHireWorkspaceNavItemActive(pathname, item) ? "rph-pill-active" : "rph-pill"}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
