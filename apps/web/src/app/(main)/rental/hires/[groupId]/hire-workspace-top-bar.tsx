"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HireWorkspaceHero } from "@/components/fleet/hire-workspace/hire-workspace-hero";
import { HireWorkspaceTabNav } from "@/components/fleet/hire-workspace/hire-workspace-tab-nav";
import type { HireSwitcherOption } from "@/lib/fleet/load-hire-workspace-shell";
import {
  hireWorkspaceHref,
  hireWorkspaceNav,
  parseHireWorkspaceSection,
} from "@/lib/fleet/hire-workspace-nav";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireWorkspaceTopBar({ hires }: { hires: HireSwitcherOption[] }) {
  const { shell, chrome } = useHireWorkspace();
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

  return (
    <div className="-mx-3 -mt-3 mb-5 px-3 pt-3">
      <nav className="hire-ws-top-breadcrumb" aria-label="Breadcrumb">
        <Link href="/rental/hires" className="font-medium text-rph-link hover:text-rph-link-hover">
          Hires
        </Link>
        <span className="text-rph-fg-muted" aria-hidden>
          ›
        </span>

        <div className="relative min-w-0 max-w-full" ref={rootRef}>
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-1 font-mono text-xs font-semibold text-rph-fg hover:text-rph-link sm:text-sm"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="truncate">{shell.vehicleVrm}</span>
            <span className="shrink-0 text-[10px] text-rph-fg-muted sm:text-xs">▾</span>
          </button>

          {open ? (
            <div className="absolute left-0 z-40 mt-1 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg">
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
      </nav>

      <section className="rph-card hire-ws-hero-card p-3 sm:p-4">
        <HireWorkspaceHero chrome={chrome} status={shell.status} backHref="/rental/hires" />
      </section>

      <HireWorkspaceTabNav items={items} />
    </div>
  );
}
