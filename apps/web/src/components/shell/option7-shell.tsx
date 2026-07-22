"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@rph/shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAccountMenu } from "@/components/shell/user-account-menu";

const SIDEBAR_COLLAPSED_KEY = "rph-sidebar-collapsed-opt7";

/** Option 7 rail border (sidebar fill uses Tailwind `bg-rph-rail` = same token as globals). */
const SIDEBAR_BORDER = "rgba(148, 163, 184, 0.12)";

export type ShellVariant = "super_admin" | "driver" | "rental_company";

export type DriverNavMode = "onboarding" | "full";

type Crumb = { label: string; href?: string };

function buildBreadcrumbs(pathname: string, variant: ShellVariant): Crumb[] {
  if (variant === "rental_company") {
    if (pathname === "/rental") {
      return [{ label: "Home", href: "/rental" }, { label: "Dashboard" }];
    }
    if (pathname === "/rental/subcompany" || pathname.startsWith("/rental/subcompany/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Subcompany", href: "/rental/subcompany" }];
    }
    if (pathname === "/rental/hires" || pathname.startsWith("/rental/hires/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Hires", href: "/rental/hires" }];
    }
    if (pathname.startsWith("/rental/esign/")) {
      return [
        { label: "Home", href: "/rental" },
        { label: "Hires", href: "/rental/hires" },
        { label: "E-sign" },
      ];
    }
    if (pathname === "/rental/vehicles" || pathname.startsWith("/rental/vehicles/")) {
      const parts = pathname.split("/").filter(Boolean);
      // /rental/vehicles/:id[/section]
      if (parts.length >= 3) {
        const vehicleId = parts[2];
        const base: Crumb[] = [
          { label: "Home", href: "/rental" },
          { label: "Vehicles", href: "/rental/vehicles" },
          { label: "Vehicle", href: `/rental/vehicles/${vehicleId}` },
        ];
        if (!parts[3]) return [...base, { label: "Dashboard" }];
        const section = parts[3];
        const sectionLabel =
          section === "details"
            ? "Details"
            : section === "rentals"
              ? "Rentals"
              : section === "maintenance"
                ? "Maintenance"
                : section === "pcn"
                  ? "PCN"
                  : section === "claims"
                    ? "Claims"
                    : section.charAt(0).toUpperCase() + section.slice(1);
        return [...base, { label: sectionLabel }];
      }
      return [{ label: "Home", href: "/rental" }, { label: "Vehicles", href: "/rental/vehicles" }];
    }
    if (pathname === "/rental/onboarding" || pathname.startsWith("/rental/onboarding/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Onboarding", href: "/rental/onboarding" }];
    }
    if (pathname === "/rental/offboarding" || pathname.startsWith("/rental/offboarding/")) {
      return [{ label: "Account", href: "/rental/offboarding" }, { label: "Offboarding" }];
    }
    if (pathname === "/rental/account-closed" || pathname.startsWith("/rental/account-closed/")) {
      return [{ label: "Account", href: "/rental/account-closed" }, { label: "Closed" }];
    }
    if (pathname === "/rental/staff" || pathname.startsWith("/rental/staff/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Staff", href: "/rental/staff" }];
    }
    if (pathname === "/rental/billing" || pathname.startsWith("/rental/billing/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Billing", href: "/rental/billing" }];
    }
    if (pathname === "/rental/notifications" || pathname.startsWith("/rental/notifications/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Notifications", href: "/rental/notifications" }];
    }
    if (pathname === "/rental/settings" || pathname.startsWith("/rental/settings/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Settings", href: "/rental/settings" }];
    }
    if (pathname === "/rental/fleet-tracking" || pathname.startsWith("/rental/fleet-tracking/")) {
      return [{ label: "Home", href: "/rental" }, { label: "Fleet Tracking", href: "/rental/fleet-tracking" }];
    }
    return [{ label: "Home", href: "/rental" }, { label: "Page" }];
  }
  if (variant === "super_admin") {
    if (pathname === "/super-admin") {
      return [{ label: "Home", href: "/super-admin" }, { label: "Super admin" }];
    }
    if (pathname === "/super-admin/companies" || pathname.startsWith("/super-admin/companies/")) {
      return [
        { label: "Home", href: "/super-admin" },
        { label: "Companies", href: "/super-admin/companies" },
      ];
    }
    if (pathname === "/super-admin/drivers" || pathname.startsWith("/super-admin/drivers/")) {
      const crumbs: Crumb[] = [{ label: "Home", href: "/super-admin" }, { label: "Drivers", href: "/super-admin/drivers" }];
      if (pathname.includes("/preview")) {
        crumbs.push({ label: "Preview" });
      }
      return crumbs;
    }
    if (pathname === "/super-admin/billing" || pathname.startsWith("/super-admin/billing/")) {
      return [{ label: "Home", href: "/super-admin" }, { label: "Billing", href: "/super-admin/billing" }];
    }
    if (pathname === "/super-admin/contract-changes" || pathname.startsWith("/super-admin/contract-changes/")) {
      return [{ label: "Home", href: "/super-admin" }, { label: "Contract changes", href: "/super-admin/contract-changes" }];
    }
    if (pathname === "/super-admin/settings/contract-terms") {
      return [
        { label: "Home", href: "/super-admin" },
        { label: "Contract terms", href: "/super-admin/settings/contract-terms" },
      ];
    }
    if (pathname === "/super-admin/settings/contract-presets" || pathname.startsWith("/super-admin/settings/")) {
      return [
        { label: "Home", href: "/super-admin" },
        { label: "Contract presets", href: "/super-admin/settings/contract-presets" },
      ];
    }
    return [{ label: "Home", href: "/super-admin" }, { label: "Page" }];
  }
  if (pathname.startsWith("/driver/onboarding")) {
    return [{ label: "Home", href: "/driver" }, { label: "Licences" }];
  }
  if (pathname === "/driver") {
    return [{ label: "Home", href: "/driver" }, { label: "Dashboard" }];
  }
  if (pathname === "/driver/profile" || pathname.startsWith("/driver/profile/")) {
    return [{ label: "Home", href: "/driver" }, { label: "Profile" }];
  }
  if (pathname === "/driver/hire-requests" || pathname.startsWith("/driver/hire-requests/")) {
    return [{ label: "Home", href: "/driver" }, { label: "Hire requests" }];
  }
  return [{ label: "Home", href: "/driver" }, { label: "Driver" }];
}

function NavLink({
  href,
  active,
  children,
  badge,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-rph-rail-soft font-semibold text-white shadow-md shadow-black/20"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      <span>{children}</span>
      {badge && badge > 0 ? (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-rph-fg-muted">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span className="text-rph-border-strong">/</span> : null}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-rph-link">
                {c.label}
              </Link>
            ) : (
              <span
                className={
                  i === items.length - 1
                    ? "font-semibold text-rph-fg"
                    : undefined
                }
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Option7Shell({
  variant,
  displayName,
  driverNavMode,
  driverLicenceBanner,
  driverPendingHireRequests = 0,
  fleetTrackingEnabled = false,
  children,
}: {
  variant: ShellVariant;
  displayName: string | null;
  driverNavMode?: DriverNavMode;
  /** Shown for drivers when licences must be reviewed (expiry / address). */
  driverLicenceBanner?: { title: string; bullets: string[] } | null;
  /** Pending hire access requests for driver nav badge. */
  driverPendingHireRequests?: number;
  /** Rental companies with Fleet Tracking (SmartCar Tracker) enabled by super-admin. */
  fleetTrackingEnabled?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Always start expanded so SSR HTML matches the first client render; restore preference after mount.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const crumbs = useMemo(() => buildBreadcrumbs(pathname, variant), [pathname, variant]);

  const nav =
    variant === "super_admin" ? (
      <>
        <NavLink
          href="/super-admin"
          active={pathname === "/super-admin"}
          onNavigate={closeMobileNav}
        >
          Dashboard
        </NavLink>
        <NavLink
          href="/super-admin/companies"
          active={pathname === "/super-admin/companies" || pathname.startsWith("/super-admin/companies/")}
          onNavigate={closeMobileNav}
        >
          Companies
        </NavLink>
        <NavLink
          href="/super-admin/drivers"
          active={pathname === "/super-admin/drivers" || pathname.startsWith("/super-admin/drivers/")}
          onNavigate={closeMobileNav}
        >
          Drivers
        </NavLink>
        <NavLink
          href="/super-admin/billing"
          active={pathname === "/super-admin/billing" || pathname.startsWith("/super-admin/billing/")}
          onNavigate={closeMobileNav}
        >
          Billing
        </NavLink>
        <NavLink
          href="/super-admin/contract-changes"
          active={pathname === "/super-admin/contract-changes" || pathname.startsWith("/super-admin/contract-changes/")}
          onNavigate={closeMobileNav}
        >
          Contract changes
        </NavLink>
        <NavLink
          href="/super-admin/settings/contract-terms"
          active={pathname === "/super-admin/settings/contract-terms"}
          onNavigate={closeMobileNav}
        >
          Contract terms
        </NavLink>
        <NavLink
          href="/super-admin/settings/contract-presets"
          active={pathname === "/super-admin/settings/contract-presets"}
          onNavigate={closeMobileNav}
        >
          Contract presets
        </NavLink>
      </>
    ) : variant === "rental_company" ? (
      <>
        <NavLink href="/rental" active={pathname === "/rental"} onNavigate={closeMobileNav}>
          Dashboard
        </NavLink>
        <NavLink
          href="/rental/subcompany"
          active={pathname === "/rental/subcompany" || pathname.startsWith("/rental/subcompany/")}
          onNavigate={closeMobileNav}
        >
          Subcompany
        </NavLink>
        <NavLink
          href="/rental/vehicles"
          active={pathname === "/rental/vehicles" || pathname.startsWith("/rental/vehicles/")}
          onNavigate={closeMobileNav}
        >
          Vehicles
        </NavLink>
        <NavLink
          href="/rental/hires"
          active={pathname === "/rental/hires" || pathname.startsWith("/rental/hires/")}
          onNavigate={closeMobileNav}
        >
          Hires
        </NavLink>
        {fleetTrackingEnabled ? (
          <NavLink
            href="/rental/fleet-tracking"
            active={pathname === "/rental/fleet-tracking" || pathname.startsWith("/rental/fleet-tracking/")}
            onNavigate={closeMobileNav}
          >
            Fleet Tracking
          </NavLink>
        ) : null}
        <NavLink
          href="/rental/staff"
          active={pathname === "/rental/staff" || pathname.startsWith("/rental/staff/")}
          onNavigate={closeMobileNav}
        >
          Staff
        </NavLink>
        <NavLink
          href="/rental/billing"
          active={pathname === "/rental/billing" || pathname.startsWith("/rental/billing/")}
          onNavigate={closeMobileNav}
        >
          Billing
        </NavLink>
        <NavLink
          href="/rental/notifications"
          active={pathname === "/rental/notifications" || pathname.startsWith("/rental/notifications/")}
          onNavigate={closeMobileNav}
        >
          Notifications
        </NavLink>
        <NavLink
          href="/rental/settings"
          active={pathname === "/rental/settings" || pathname.startsWith("/rental/settings/")}
          onNavigate={closeMobileNav}
        >
          Settings
        </NavLink>
      </>
    ) : driverNavMode !== "full" ? (
      <>
        <NavLink
          href="/driver/hire-requests"
          active={pathname === "/driver/hire-requests" || pathname.startsWith("/driver/hire-requests/")}
          badge={driverPendingHireRequests}
          onNavigate={closeMobileNav}
        >
          Hire requests
        </NavLink>
        <NavLink
          href="/driver/onboarding"
          active={pathname.startsWith("/driver/onboarding")}
          onNavigate={closeMobileNav}
        >
          Onboarding
        </NavLink>
      </>
    ) : (
      <>
        <NavLink href="/driver" active={pathname === "/driver"} onNavigate={closeMobileNav}>
          Dashboard
        </NavLink>
        <NavLink
          href="/driver/hire-requests"
          active={pathname === "/driver/hire-requests" || pathname.startsWith("/driver/hire-requests/")}
          badge={driverPendingHireRequests}
          onNavigate={closeMobileNav}
        >
          Hire requests
        </NavLink>
        <NavLink
          href="/driver/onboarding"
          active={pathname.startsWith("/driver/onboarding")}
          onNavigate={closeMobileNav}
        >
          Licences
        </NavLink>
        <NavLink
          href="/driver/profile"
          active={pathname === "/driver/profile" || pathname.startsWith("/driver/profile/")}
          onNavigate={closeMobileNav}
        >
          Profile
        </NavLink>
      </>
    );

  const year = new Date().getFullYear();

  const accountProfile =
    variant === "driver"
      ? { href: "/driver/profile" as const, label: "Profile" as const }
      : variant === "rental_company"
        ? { href: "/rental" as const, label: "Dashboard" as const }
        : { href: "/super-admin" as const, label: "Dashboard" as const };

  return (
    <div className="flex min-h-dvh w-full min-w-0">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label="Close menu"
          onClick={closeMobileNav}
        />
      ) : null}

      <aside
        id="app-sidebar"
        style={{ borderRightColor: SIDEBAR_BORDER }}
        className={[
          "z-40 flex w-56 max-w-[85vw] flex-col border-r bg-rph-rail transition-transform duration-200 ease-out lg:w-60",
          "fixed inset-y-0 left-0 min-w-0 md:relative md:inset-auto md:max-w-none",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          sidebarCollapsed ? "md:hidden" : "md:shrink-0",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span
            className="size-2.5 shrink-0 rounded-[3px] bg-rph-rail-softer ring-1 ring-white/10"
            aria-hidden
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold uppercase tracking-[0.14em] text-white">
              {APP_NAME}
            </div>
            {variant === "super_admin" ? (
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Console
              </div>
            ) : variant === "rental_company" ? (
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Rental company
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Driver
              </div>
            )}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">{nav}</nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-rph-page">
        <header className="shrink-0 border-b border-rph-border bg-rph-raised">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              className="rounded-lg p-2 text-rph-fg-secondary hover:bg-rph-chrome md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="app-sidebar"
              aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <button
              type="button"
              className="hidden rounded-lg p-2 text-rph-fg-secondary hover:bg-rph-chrome md:inline-flex"
              aria-expanded={!sidebarCollapsed}
              aria-controls="app-sidebar"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebarCollapsed}
            >
              {sidebarCollapsed ? (
                <IconChevronRight className="h-5 w-5" />
              ) : (
                <IconChevronLeft className="h-5 w-5" />
              )}
            </button>

            <div className="relative hidden min-w-0 max-w-md flex-1 md:block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rph-fg-muted">
                ⌕
              </span>
              <input
                type="search"
                placeholder="Search…"
                readOnly
                className="w-full rounded-lg border border-rph-border bg-rph-chrome py-2 pl-9 pr-3 text-sm text-rph-fg placeholder:text-rph-fg-muted"
                aria-label="Search (coming soon)"
              />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                className="relative rounded-lg p-2 text-rph-fg-secondary hover:bg-rph-chrome"
                aria-label="Notifications (coming soon)"
              >
                <IconBell className="h-5 w-5" />
                <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rph-rail-soft px-0.5 text-[10px] font-bold leading-none text-white">
                  1
                </span>
              </button>
              <ThemeToggle />
              <UserAccountMenu
                displayName={displayName}
                profileHref={accountProfile.href}
                profileLabel={accountProfile.label}
              />
            </div>
          </div>

          <div className="border-t border-rph-border bg-rph-chrome px-4 py-2">
            <Breadcrumbs items={crumbs} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-rph-page">
          <main className="min-h-0 w-full min-w-0 flex-1 overflow-auto p-3">
            {variant === "driver" && driverLicenceBanner && driverLicenceBanner.bullets.length > 0 ? (
              <div
                className="mb-3 w-full rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 dark:border-amber-800/80 dark:bg-amber-950/50"
                role="status"
              >
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  {driverLicenceBanner.title}
                </p>
                <ul className="mt-2 list-inside list-disc text-sm text-amber-950/90 dark:text-amber-100/90">
                  {driverLicenceBanner.bullets.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <Link
                  href="/driver/onboarding"
                  className="mt-3 inline-flex text-sm font-semibold text-amber-950 underline decoration-amber-950/40 hover:decoration-amber-950 dark:text-amber-50 dark:decoration-amber-200/40"
                >
                  Update licences →
                </Link>
              </div>
            ) : null}
            <div className="rph-panel w-full min-w-0 max-w-none p-3 sm:p-4">
              {children}
            </div>
          </main>

          <footer className="shrink-0 border-t border-rph-border bg-rph-raised px-4 py-3 text-center text-xs text-rph-fg-muted">
            <span>© {year} {APP_NAME}</span>
            <span className="mx-2 text-rph-border-strong">·</span>
            <a href="#" className="hover:text-rph-link">
              About
            </a>
            <span className="mx-2 text-rph-border-strong">·</span>
            <a href="#" className="hover:text-rph-link">
              Contact
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
