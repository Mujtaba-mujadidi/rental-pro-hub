/** Hire workspace section navigation (redesign). */
export type HireWorkspaceNavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  match: "exact" | "prefix";
};

export type HireWorkspaceSection =
  | ""
  | "checkout"
  | "checkin"
  | "payments"
  | "settlement"
  | "documents"
  | "details"
  | "activity"
  | "end-hire";

export function hireWorkspaceNav(groupId: string): HireWorkspaceNavItem[] {
  const base = `/rental/hires/${groupId}`;
  return [
    { href: base, label: "Summary", match: "exact" },
    { href: `${base}/checkout`, label: "Inspections", match: "prefix" },
    { href: `${base}/payments`, label: "Payments & balance", mobileLabel: "Payments", match: "prefix" },
    { href: `${base}/details`, label: "Details & documents", mobileLabel: "Details", match: "prefix" },
    { href: `${base}/activity`, label: "Activity", match: "prefix" },
    { href: `${base}/end-hire`, label: "End hire", mobileLabel: "End", match: "prefix" },
  ];
}

export function hireWorkspaceHref(groupId: string, section: HireWorkspaceSection = "") {
  return section ? `/rental/hires/${groupId}/${section}` : `/rental/hires/${groupId}`;
}

export function parseHireWorkspaceSection(pathname: string, groupId: string): HireWorkspaceSection {
  const base = `/rental/hires/${groupId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (
    segment === "checkout" ||
    segment === "checkin" ||
    segment === "payments" ||
    segment === "settlement" ||
    segment === "documents" ||
    segment === "details" ||
    segment === "activity" ||
    segment === "end-hire"
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
  if (item.label === "Inspections") {
    return (
      pathname.startsWith(`${item.href}`) ||
      pathname.includes("/checkin")
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
