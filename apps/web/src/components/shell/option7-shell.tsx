"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { APP_NAME } from "@rph/shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAccountMenu } from "@/components/shell/user-account-menu";

const SIDEBAR_COLLAPSED_KEY = "rph-sidebar-collapsed-opt7";

/** Option 7 rail border (sidebar fill uses Tailwind `bg-rph-rail` = same token as globals). */
const SIDEBAR_BORDER = "rgba(148, 163, 184, 0.12)";

export type ShellVariant = "super_admin" | "driver";

export type DriverNavMode = "onboarding" | "full";

type Crumb = { label: string; href?: string };

function buildBreadcrumbs(pathname: string, variant: ShellVariant): Crumb[] {
  if (variant === "super_admin") {
    if (pathname === "/super-admin") {
      return [{ label: "Home", href: "/super-admin" }, { label: "Super admin" }];
    }
    if (pathname === "/super-admin/drivers" || pathname.startsWith("/super-admin/drivers/")) {
      const crumbs: Crumb[] = [{ label: "Home", href: "/super-admin" }, { label: "Drivers", href: "/super-admin/drivers" }];
      if (pathname.includes("/preview")) {
        crumbs.push({ label: "Preview" });
      }
      return crumbs;
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
  return [{ label: "Home", href: "/driver" }, { label: "Driver" }];
}

function NavLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-rph-rail-soft font-semibold text-white shadow-md shadow-black/20"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      {children}
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
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span className="text-slate-300 dark:text-slate-600">/</span> : null}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-rph-rail dark:hover:text-rph-rail-softer">
                {c.label}
              </Link>
            ) : (
              <span
                className={
                  i === items.length - 1
                    ? "font-semibold text-slate-800 dark:text-slate-100"
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
  children,
}: {
  variant: ShellVariant;
  displayName: string | null;
  driverNavMode?: DriverNavMode;
  /** Shown for drivers when licences must be reviewed (expiry / address). */
  driverLicenceBanner?: { title: string; bullets: string[] } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
          href="/super-admin/drivers"
          active={pathname === "/super-admin/drivers" || pathname.startsWith("/super-admin/drivers/")}
          onNavigate={closeMobileNav}
        >
          Drivers
        </NavLink>
      </>
    ) : driverNavMode !== "full" ? (
      <NavLink
        href="/driver/onboarding"
        active={pathname.startsWith("/driver/onboarding")}
        onNavigate={closeMobileNav}
      >
        Onboarding
      </NavLink>
    ) : (
      <>
        <NavLink href="/driver" active={pathname === "/driver"} onNavigate={closeMobileNav}>
          Dashboard
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
            ) : (
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Driver
              </div>
            )}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">{nav}</nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
        <header className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="app-sidebar"
              aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <button
              type="button"
              className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex"
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
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
              <input
                type="search"
                placeholder="Search…"
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                aria-label="Search (coming soon)"
              />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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

          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/80">
            <Breadcrumbs items={crumbs} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            {driverLicenceBanner && driverLicenceBanner.bullets.length > 0 ? (
              <div
                className="mx-auto mb-4 max-w-7xl rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 dark:border-amber-800/80 dark:bg-amber-950/50 md:px-5"
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
            <div className="mx-auto max-w-7xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
              {children}
            </div>
          </main>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <span>© {year} {APP_NAME}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
            <a href="#" className="hover:text-rph-rail dark:hover:text-rph-rail-softer">
              About
            </a>
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
            <a href="#" className="hover:text-rph-rail dark:hover:text-rph-rail-softer">
              Contact
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
