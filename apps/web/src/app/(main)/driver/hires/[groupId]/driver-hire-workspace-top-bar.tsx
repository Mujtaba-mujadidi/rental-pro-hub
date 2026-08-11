"use client";

import Link from "next/link";
import { HireWorkspaceHero } from "@/components/fleet/hire-workspace/hire-workspace-hero";
import { HireWorkspaceTabNav } from "@/components/fleet/hire-workspace/hire-workspace-tab-nav";
import {
  driverHireWorkspaceNav,
  isDriverHireWorkspaceNavItemActive,
} from "@/lib/fleet/driver-hire-workspace-nav";
import { useDriverHireWorkspace } from "./driver-hire-workspace-provider";

export function DriverHireWorkspaceTopBar() {
  const { shell, chrome } = useDriverHireWorkspace();
  const items = driverHireWorkspaceNav(shell.hireGroupId);

  const backLink =
    shell.status === "reserved" || shell.status === "active"
      ? { href: "/driver", label: "Home" }
      : { href: "/driver/hire-history", label: "Hire history" };

  return (
    <div className="-mx-3 -mt-3 mb-5 px-3 pt-3">
      <nav className="hire-ws-top-breadcrumb" aria-label="Breadcrumb">
        <Link href={backLink.href} className="font-medium text-rph-link hover:text-rph-link-hover">
          {backLink.label}
        </Link>
        <span className="text-rph-fg-muted" aria-hidden>
          ›
        </span>
        <span className="truncate font-mono text-xs font-semibold text-rph-fg sm:text-sm">{shell.vehicleVrm}</span>
      </nav>

      <section className="rph-card hire-ws-hero-card p-3 sm:p-4">
        <HireWorkspaceHero chrome={chrome} status={shell.status} mode="driver" backHref={backLink.href} />
      </section>

      <HireWorkspaceTabNav items={items} isItemActive={isDriverHireWorkspaceNavItemActive} />
    </div>
  );
}
