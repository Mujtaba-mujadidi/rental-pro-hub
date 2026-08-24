"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isHireWorkspaceNavItemActive,
  type HireWorkspaceNavItem,
} from "@/lib/fleet/hire-workspace-nav";

export type HireWorkspaceTabItem = HireWorkspaceNavItem;

function tabIcon(label: string) {
  const cls = "h-4 w-4 shrink-0 opacity-70";
  switch (label) {
    case "Summary":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 19h16M6 16V8m4 8V5m4 11v-6m4 6V9" strokeLinecap="round" />
        </svg>
      );
    case "Inspections":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" />
        </svg>
      );
    case "Payments":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case "Details & documents":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
        </svg>
      );
    case "Activity":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      );
    case "End hire":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function HireWorkspaceTabNav({
  items,
  isItemActive = isHireWorkspaceNavItemActive,
}: {
  items: HireWorkspaceTabItem[];
  isItemActive?: (pathname: string, item: HireWorkspaceTabItem) => boolean;
}) {
  const pathname = usePathname();
  return (
    <nav
      className="hire-ws-tab-nav -mx-1 mt-3 overflow-x-auto overscroll-x-contain border-b border-rph-border px-1 sm:mt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Hire sections"
    >
      <div className="flex w-max min-w-full gap-4 sm:gap-6">
        {items.map((item) => {
          const active = isItemActive(pathname, item);
          const mobileLabel = item.mobileLabel ?? item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={[
                active ? "hire-ws-tab hire-ws-tab-active" : "hire-ws-tab",
                item.label === "End hire" ? "hire-ws-tab-end-hire" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <span className="hidden sm:inline-flex">{tabIcon(item.label)}</span>
              <span className="sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
