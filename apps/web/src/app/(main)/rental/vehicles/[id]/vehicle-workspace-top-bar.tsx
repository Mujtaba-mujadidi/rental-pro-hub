"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { VehicleSwitcherOption } from "@/app/actions/rental-vehicles";
import {
  VEHICLE_STATUS_LABELS,
  type VehicleRow,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";
import {
  isVehicleWorkspaceNavItemActive,
  parseVehicleWorkspaceSection,
  vehicleWorkspaceHref,
  vehicleWorkspaceNav,
} from "@/lib/fleet/vehicle-workspace-nav";

export function VehicleWorkspaceTopBar({
  vehicle,
  fleet,
}: {
  vehicle: VehicleRow;
  fleet: VehicleSwitcherOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const section = parseVehicleWorkspaceSection(pathname, vehicle.id);
  const items = vehicleWorkspaceNav(vehicle.id);

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
    if (!q) return fleet;
    return fleet.filter(
      (v) =>
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        `${v.make} ${v.model}`.toLowerCase().includes(q),
    );
  }, [fleet, query]);

  function switchTo(id: string) {
    setOpen(false);
    setQuery("");
    if (id === vehicle.id) return;
    router.push(vehicleWorkspaceHref(id, section));
  }

  return (
    <div className="rph-chrome -mx-3 -mt-3 mb-5 border-b px-3 py-2.5">
      {/* Row 1: back + vehicle switcher (+ status on sm+) */}
      <div className="flex items-center gap-2">
        <Link
          href="/rental/vehicles"
          className="rph-link shrink-0 text-sm font-semibold"
          aria-label="Back to fleet"
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← Fleet</span>
        </Link>

        <div className="relative min-w-0 flex-1 sm:max-w-56 sm:flex-none" ref={rootRef}>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-left text-sm shadow-sm"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold text-rph-fg">{vehicle.vrm}</span>
              <span className="text-rph-fg-muted">
                {" "}
                · {vehicle.make} {vehicle.model}
              </span>
            </span>
            <span className="shrink-0 text-xs text-rph-fg-muted" aria-hidden>
              ▾
            </span>
          </button>

          {open ? (
            <div className="absolute left-0 right-0 z-40 mt-1 max-h-[min(70vh,24rem)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg sm:left-0 sm:right-auto sm:w-[min(100vw-2rem,20rem)]">
              <div className="border-b border-rph-border p-2">
                <input
                  ref={inputRef}
                  className="rph-input py-1.5"
                  placeholder="Search VRM, make, model…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ul className="max-h-64 overflow-y-auto overscroll-contain py-1" role="listbox">
                {!filtered.length ? (
                  <li className="px-3 py-2 text-sm text-rph-fg-muted">No vehicles match.</li>
                ) : (
                  filtered.map((v) => {
                    const active = v.id === vehicle.id;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={[
                            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm sm:py-2",
                            active
                              ? "bg-rph-rail/10 text-rph-link"
                              : "text-rph-fg hover:bg-rph-chrome",
                          ].join(" ")}
                          onClick={() => switchTo(v.id)}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-mono font-semibold">{v.vrm}</span>
                            <span className="text-rph-fg-muted">
                              {" "}
                              · {v.make} {v.model}
                            </span>
                          </span>
                          <StatusChip status={v.status} />
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
          <StatusChip status={vehicle.status} />
          <span className="max-w-[8rem] truncate text-xs font-medium text-rph-fg-muted lg:max-w-[12rem]">
            {vehicle.subcompany_name ?? "—"}
          </span>
        </div>
      </div>

      {/* Row 2: section pills — full-width scroll on all sizes */}
      <nav
        className="-mx-3 mt-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Vehicle sections"
      >
        <div className="flex w-max gap-1 pb-0.5">
          {items.map((item) => {
            const active = isVehicleWorkspaceNavItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "rph-pill-active" : "rph-pill"}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile-only status / location under nav */}
      <div className="mt-2 flex items-center gap-2 sm:hidden">
        <StatusChip status={vehicle.status} />
        <span className="min-w-0 truncate text-xs font-medium text-rph-fg-muted">
          {vehicle.subcompany_name ?? "—"}
        </span>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: VehicleStatus }) {
  const tone =
    status === "available"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800/60"
      : status === "on_rent" || status === "reserved"
        ? "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-800/60"
        : status === "repair" || status === "accident_claim"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800/50"
          : "bg-rph-chrome text-rph-fg-secondary dark:ring-rph-border-strong";

  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide dark:ring-1 ${tone}`}
    >
      {VEHICLE_STATUS_LABELS[status]}
    </span>
  );
}
