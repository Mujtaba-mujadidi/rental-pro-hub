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
      ? { href: "/driver", label: "Back to home" }
      : { href: "/driver/hire-history", label: "Back to hire history" };

  return (
    <div className="-mx-3 -mt-3 mb-5 px-3 pt-3">
      <div className="hire-ws-top-back-row">
        <Link href={backLink.href} className="hire-ws-back-link">
          <span aria-hidden>←</span> {backLink.label}
        </Link>
      </div>

      <section className="rph-card hire-ws-hero-card">
        <HireWorkspaceHero chrome={chrome} status={shell.status} mode="driver" />
      </section>

      <HireWorkspaceTabNav items={items} isItemActive={isDriverHireWorkspaceNavItemActive} />
    </div>
  );
}
