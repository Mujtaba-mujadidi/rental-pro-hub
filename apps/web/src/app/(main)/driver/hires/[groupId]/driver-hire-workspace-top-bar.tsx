"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import {
  driverHireWorkspaceNav,
  isDriverHireWorkspaceNavItemActive,
  parseDriverHireWorkspaceSection,
} from "@/lib/fleet/driver-hire-workspace-nav";
import { useDriverHireWorkspace } from "./driver-hire-workspace-provider";

export function DriverHireWorkspaceTopBar() {
  const { shell } = useDriverHireWorkspace();
  const pathname = usePathname();
  const section = parseDriverHireWorkspaceSection(pathname, shell.hireGroupId);
  const items = driverHireWorkspaceNav(shell.hireGroupId, shell.status);
  const statusTone = driverHireStatusTone(shell.status);

  const backLink =
    shell.status === "reserved" || shell.status === "active"
      ? { href: "/driver", label: "Home" }
      : { href: "/driver/hire-history", label: "Hire history" };

  return (
    <div className="rph-chrome -mx-3 -mt-3 mb-5 border-b px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={backLink.href}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
        >
          ← {backLink.label}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-rph-fg">{shell.companyName}</p>
          <p className="truncate text-xs text-rph-fg-muted">
            {shell.vehicleVrm} · {shell.vehicleMakeModel}
            {shell.rentLabel ? ` · ${shell.rentLabel}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(statusTone)}`}
        >
          {shell.statusLabel}
        </span>
      </div>
      {shell.terminatedAtLabel ? (
        <p className="mt-2 text-xs text-rph-fg-muted">Contract ended {shell.terminatedAtLabel}</p>
      ) : null}

      <nav
        className="-mx-3 mt-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Hire sections"
      >
        <div className="flex w-max gap-1 pb-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isDriverHireWorkspaceNavItemActive(pathname, item) ? "rph-pill-active" : "rph-pill"}
              aria-current={section && item.href.endsWith(section) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
