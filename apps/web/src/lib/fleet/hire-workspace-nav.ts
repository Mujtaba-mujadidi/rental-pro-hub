/** Hire workspace section pills (mirrors vehicle-workspace-nav). */
export type HireWorkspaceNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

export type HireWorkspaceSection =
  | ""
  | "payments"
  | "settlement"
  | "documents"
  | "details"
  | "activity"
  | "checkout"
  | "checkin";

export function hireWorkspaceNav(groupId: string, status?: string): HireWorkspaceNavItem[] {
  const base = `/rental/hires/${groupId}`;
  const paymentsLabel =
    status === "terminated" || status === "completed" ? "Payments & settlement" : "Payments";
  const items: HireWorkspaceNavItem[] = [
    { href: base, label: "Overview", match: "exact" },
    { href: `${base}/payments`, label: paymentsLabel, match: "prefix" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
    { href: `${base}/activity`, label: "Activity", match: "prefix" },
  ];

  if (status === "reserved" || status === "active" || status === "terminated" || status === "completed") {
    items.splice(1, 0, { href: `${base}/checkout`, label: "Checkout", match: "prefix" });
  }
  if (status === "terminated" || status === "completed") {
    items.splice(2, 0, { href: `${base}/checkin`, label: "Check-in", match: "prefix" });
    items.splice(3, 0, { href: `${base}/settlement`, label: "Settlement", match: "prefix" });
  }

  return items;
}

export function hireWorkspaceHref(
  groupId: string,
  section: HireWorkspaceSection = "",
) {
  return section ? `/rental/hires/${groupId}/${section}` : `/rental/hires/${groupId}`;
}

export function parseHireWorkspaceSection(pathname: string, groupId: string): HireWorkspaceSection {
  const base = `/rental/hires/${groupId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (
    segment === "payments" ||
    segment === "documents" ||
    segment === "details" ||
    segment === "activity" ||
    segment === "checkout" ||
    segment === "checkin" ||
    segment === "settlement"
  ) {
    return segment;
  }
  return "";
}

export function parseHireWorkspaceGroupId(pathname: string): string | null {
  const m = pathname.match(/^\/rental\/hires\/([^/]+)/);
  return m?.[1] ?? null;
}

export function isHireWorkspaceNavItemActive(pathname: string, item: HireWorkspaceNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
