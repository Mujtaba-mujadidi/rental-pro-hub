"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { VehicleSwitcherOption } from "@/app/actions/rental-vehicles";
import { HireWorkspaceChip, HireWorkspacePlate } from "@/components/fleet/hire-workspace/hire-workspace-ui";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { isHistoricVehicleWorkspaceAccess } from "@/lib/fleet/vehicle-historic-access";
import {
  isVehicleWorkspaceNavItemActive,
  parseVehicleWorkspaceSection,
  vehicleWorkspaceHref,
  vehicleWorkspaceNav,
} from "@/lib/fleet/vehicle-workspace-nav";
import { vehicleStatusPillClass, type VehicleStatus } from "@/lib/fleet/vehicles";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";

function fleetStatusLabel(status: VehicleStatus): string {
  if (status === "on_rent") return "On hire";
  if (status === "available") return "Available";
  if (status === "reserved") return "Reserved";
  if (status === "repair") return "Repair";
  if (status === "accident_claim") return "Accident claim";
  if (status === "sold") return "Sold";
  return status;
}

export function VehicleWorkspaceTopBar({
  fleet,
}: {
  fleet: VehicleSwitcherOption[];
}) {
  const { shell } = useVehicleWorkspace();
  const vehicle = shell.vehicle;
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

  const missing = vehicle.missing_docs ?? [];
  const docsComplete = missing.length === 0;
  const currentHireId = shell.currentOpenHire?.id ?? null;
  const showOpenHire = Boolean(currentHireId);

  return (
    <div className="mb-5 space-y-4">
      <Link
        href="/rental/vehicles"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-rph-link hover:text-rph-link-hover"
      >
        <IconArrowLeft className="h-4 w-4 shrink-0" />
        Back to vehicles
      </Link>

      <section className="rph-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <HireWorkspacePlate vrm={vehicle.vrm} />
            <div className="relative min-w-0 flex-1" ref={rootRef}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={vehicleStatusPillClass(vehicle.status)}>{fleetStatusLabel(vehicle.status)}</span>
                <HireWorkspaceChip tone={docsComplete ? "success" : "warn"}>
                  {docsComplete ? "Documents complete" : "Documents incomplete"}
                </HireWorkspaceChip>
              </div>
              <button
                type="button"
                className="mt-2 block w-full min-w-0 text-left"
                aria-expanded={open}
                aria-haspopup="listbox"
                onClick={() => setOpen((v) => !v)}
              >
                <h1 className="text-xl font-semibold tracking-tight text-rph-fg sm:text-2xl">
                  {vehicle.make} {vehicle.model}
                </h1>
                <p className="mt-0.5 text-sm text-rph-fg-secondary">
                  <span className="font-medium text-rph-fg">{vehicle.vrm}</span>
                  <span className="text-rph-fg-muted"> · </span>
                  <span>{vehicle.subcompany_name ?? "—"}</span>
                  <span className="ml-1 text-xs text-rph-fg-muted" aria-hidden>
                    ▾
                  </span>
                </p>
              </button>

              {open ? (
                <div className="absolute z-40 mt-2 w-[min(100vw-2rem,22rem)] max-w-full overflow-hidden rounded-lg border border-rph-border bg-rph-elevated shadow-lg">
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
                                "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm",
                                active ? "bg-rph-rail/10 text-rph-link" : "text-rph-fg hover:bg-rph-chrome",
                              ].join(" ")}
                              onClick={() => switchTo(v.id)}
                            >
                              <span className="min-w-0 truncate">
                                <span className="font-semibold">{v.vrm}</span>
                                <span className="text-rph-fg-muted">
                                  {" "}
                                  · {v.make} {v.model}
                                </span>
                              </span>
                              <span className={vehicleStatusPillClass(v.status)}>{fleetStatusLabel(v.status)}</span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {showOpenHire && currentHireId ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <Link
                href={`/rental/hires/${currentHireId}`}
                className="rph-btn-primary inline-flex h-10 w-full items-center justify-center sm:w-auto"
              >
                Open current hire
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <nav
        className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Vehicle sections"
      >
        <div className="flex w-max gap-1 border-b border-rph-border pb-px">
          {items.map((item) => {
            const active = isVehicleWorkspaceNavItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "inline-flex shrink-0 items-center border-b-2 border-sky-600 px-3 py-2.5 text-sm font-semibold text-sky-700 dark:border-sky-400 dark:text-sky-300"
                    : "inline-flex shrink-0 items-center border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-rph-fg-muted transition-colors hover:text-rph-fg"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {isHistoricVehicleWorkspaceAccess(shell.access) ? (
        <p className="rph-alert-warn text-xs">
          Historic read-only — transferred to {shell.access.transfer.to_name ?? "another company"} on{" "}
          {formatUkDateTime(shell.access.transfer.transferred_at)}.
        </p>
      ) : null}
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
